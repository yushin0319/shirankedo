import {
  buildGeminiRequest,
  callGemini,
  notifyObs,
  parseGeminiJson,
  pingHealthchecks,
  postIngest,
  sanitizeForPrompt,
} from "./cron-shared";

const HC_SLUG = "shirankedo-daily-vulns";

export interface DailyVulnsEnv {
  GEMINI_API_KEY: string;
  INGEST_API_KEY: string;
  N8N_WEBHOOK_SECRET?: string;
  HC_PING_KEY?: string;
  DAILY_VULNS_ENABLED?: string;
}

interface NvdCveEntry {
  cve?: {
    id?: string;
    descriptions?: { lang: string; value: string }[];
    metrics?: {
      cvssMetricV31?: { cvssData?: { baseScore?: number } }[];
      cvssMetricV30?: { cvssData?: { baseScore?: number } }[];
    };
    published?: string;
  };
}

interface ParsedVuln {
  cveId: string;
  description: string;
  cvssScore: number;
  publishedAt: string;
}

interface VulnForApi {
  cveId: string;
  title: string;
  cvssScore: number;
  publishedAt: string;
}

export async function runDailyVulns(env: DailyVulnsEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_VULNS_ENABLED !== "true";

  console.log(JSON.stringify({ type: "daily_vulns_start", dry_run: dryRun }));

  // 1. 並列: NVD API（過去48h）+ 既存 CVE IDs
  const now = new Date();
  const past = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace("Z", "");
  const nvdUrl = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${fmt(past)}&pubEndDate=${fmt(now)}`;

  const [nvdRes, existingRes] = await Promise.all([
    fetch(nvdUrl),
    fetch(
      "https://shirankedo.y-fudo.workers.dev/api/ingest/vulnerabilities/cve-ids",
      { headers: { "X-API-Key": env.INGEST_API_KEY } },
    ),
  ]);

  if (!nvdRes.ok) throw new Error(`NVD API HTTP ${nvdRes.status}`);
  if (!existingRes.ok)
    throw new Error(`existing CVE IDs HTTP ${existingRes.status}`);

  const nvdData = (await nvdRes.json()) as {
    vulnerabilities?: NvdCveEntry[];
  };
  const existingData = (await existingRes.json()) as { data?: string[] };
  const existingIds = new Set(existingData.data ?? []);

  // 2. パース: CVSS >= 8.0 + 既存除外
  const vulns: ParsedVuln[] = [];
  for (const v of nvdData.vulnerabilities ?? []) {
    const cve = v.cve ?? {};
    const cveId = cve.id ?? "";
    if (!cveId || existingIds.has(cveId)) continue;

    const enDesc = (cve.descriptions ?? []).find((d) => d.lang === "en");
    if (!enDesc?.value) continue;

    const metrics = cve.metrics ?? {};
    let cvssScore: number | null = null;
    if (metrics.cvssMetricV31?.length) {
      cvssScore = metrics.cvssMetricV31[0].cvssData?.baseScore ?? null;
    } else if (metrics.cvssMetricV30?.length) {
      cvssScore = metrics.cvssMetricV30[0].cvssData?.baseScore ?? null;
    }
    if (cvssScore === null || cvssScore < 8.0) continue;

    vulns.push({
      cveId,
      description: enDesc.value.substring(0, 500),
      cvssScore,
      publishedAt: (cve.published ?? "").substring(0, 10),
    });
  }

  console.log(
    JSON.stringify({ type: "daily_vulns_parsed", count: vulns.length }),
  );

  let apiBody: VulnForApi[] = [];

  if (vulns.length > 0) {
    // 3. Gemini 翻訳（一括）。失敗時は英語説明から短縮タイトルをフォールバック生成
    const fallbackTitles = vulns.map((v, i) => ({
      index: i + 1,
      title: v.description.substring(0, 50),
    }));

    const vulnText = vulns
      .map(
        (v, i) =>
          `${i + 1}. [${v.cveId}] (CVSS: ${v.cvssScore}) ${sanitizeForPrompt(v.description, 300)}`,
      )
      .join("\n\n");

    const prompt = `以下のNVD脆弱性情報の英語説明を、簡潔な日本語タイトル（30～50字）に変換してください。
技術用語はカタカナまたは英語のまま残してください。

## 脆弱性一覧（${vulns.length}件）
${vulnText}

## 出力形式（JSON配列）
[{"index": 1, "title": "日本語タイトル"}]
JSONのみ出力してください。`;

    const geminiBody = buildGeminiRequest({
      prompt,
      temperature: 0.2,
      thinkingBudget: 0,
    });

    let geminiWarning: string | null = null;
    let titles = fallbackTitles;
    try {
      const resp = await callGemini(
        env.GEMINI_API_KEY,
        "gemini-2.5-flash",
        geminiBody,
      );
      titles = parseGeminiJson<{ index: number; title: string }[]>(resp);
    } catch (e: unknown) {
      geminiWarning = String(e); // Gemini失敗記録
      titles = fallbackTitles;
      console.log(
        JSON.stringify({
          type: "gemini_translate_fallback",
          count: vulns.length,
          error: String(e),
        }),
      );
    }

    apiBody = vulns.map((v, i) => {
      const t = titles.find((t) => t.index === i + 1);
      return {
        cveId: v.cveId,
        title: t?.title ?? v.description.substring(0, 50),
        cvssScore: v.cvssScore,
        publishedAt: v.publishedAt,
      };
    });
  }

  const durationMs = Date.now() - start;
  const summary = `daily-vulns${dryRun ? " (dry-run)" : ""}: ${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_vulns_done",
      count: apiBody.length,
      duration_ms: durationMs,
      dry_run: dryRun,
    }),
  );

  if (dryRun) return;

  if (apiBody.length > 0) {
    const postRes = await postIngest(
      "vulnerabilities",
      env.INGEST_API_KEY,
      apiBody,
    );
    if (!postRes.ok)
      console.log(
        JSON.stringify({
          type: "daily_vulns_post_failed",
          error: postRes.error,
        }),
      );
  }

  if (env.N8N_WEBHOOK_SECRET) {
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: geminiWarning ? "warning" : "info",
      subject: geminiWarning
        ? `⚠️ shirankedo daily-vulns 完了(AI翻訳失敗) (${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s)`
        : `✅ shirankedo daily-vulns 完了 (${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s)`,
      summary,
    });
    if (!r.ok)
      console.log(
        JSON.stringify({ type: "obs_notify_failed", error: r.error }),
      );
  }

  if (env.HC_PING_KEY) {
    const r = await pingHealthchecks(env.HC_PING_KEY, HC_SLUG, true, summary);
    if (!r.ok)
      console.log(JSON.stringify({ type: "hc_ping_failed", error: r.error }));
  }
}
