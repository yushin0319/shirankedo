import { getDb } from "../../db/client";
import { processRepoStats } from "../api/ingest-simple";
import { getTrackingRepos, processTrackingRepos } from "../api/ingest-upsert";
import {
  buildGeminiRequest,
  callGemini,
  notifyObs,
  parseGeminiText,
  pingHealthchecks,
  sanitizeForPrompt,
} from "./cron-shared";

const GH_SEARCH_BASE = "https://api.github.com/search/repositories";
const SEARCH_DELAY_MS = 2000;
const HC_SLUG = "shirankedo-daily-repos";

export interface DailyReposEnv {
  DB: D1Database;
  GITHUB_TOKEN: string;
  GEMINI_API_KEY: string;
  N8N_WEBHOOK_SECRET?: string;
  HC_PING_KEY?: string;
  DAILY_REPOS_ENABLED?: string;
}

interface SearchRepoItem {
  repo: string;
  name: string;
  description: string;
  language: string;
  stars: number;
}

interface TranslatedRepo {
  repo: string;
  displayName: string;
  description: string;
  language: string;
  stars: number;
}

const BLOCKLIST = [
  "awesome",
  "interview",
  "free-programming-books",
  "build-your-own",
  "public-apis",
  "developer-roadmap",
  "system-design",
  "cheatsheet",
  "learn-",
  "tutorial",
  "roadmap",
  "study-plan",
  "coding-guide",
  "freeCodeCamp",
  "computer-science",
  "project-based-learning",
  "the-art-of-command-line",
  "the-book-of-secret-knowledge",
];

function buildSearchQueries(): string[] {
  const now = new Date();
  const ago = (days: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };

  const tiers = [
    { q: "stars:>50000" },
    { q: `stars:10000..50000 pushed:>${ago(365)}` },
    { q: `stars:5000..10000 pushed:>${ago(180)}` },
    { q: `stars:2000..5000 pushed:>${ago(90)}` },
    { q: `stars:1000..2000 pushed:>${ago(30)}` },
  ];

  const urls: string[] = [];
  for (const tier of tiers) {
    for (let page = 1; page <= 2; page++) {
      urls.push(
        `${GH_SEARCH_BASE}?q=${encodeURIComponent(tier.q)}&sort=stars&order=desc&per_page=100&page=${page}`,
      );
    }
  }
  return urls;
}

export async function runDailyRepos(env: DailyReposEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_REPOS_ENABLED !== "true";
  const db = getDb(env.DB);

  // 1. 既存リポ一覧取得 (D1 直接)
  const existingData = await getTrackingRepos(db);
  const existingSet = new Set(existingData.map((r) => r.repo.toLowerCase()));

  console.log(
    JSON.stringify({
      type: "daily_repos_start",
      existing: existingSet.size,
      dry_run: dryRun,
    }),
  );

  // 2. GitHub Search 10クエリ（2s間隔）
  const queryUrls = buildSearchQueries();
  const allItems: SearchRepoItem[] = [];
  const seenRepos = new Set<string>();

  for (let i = 0; i < queryUrls.length; i++) {
    const res = await fetch(queryUrls[i], {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "shirankedo-daily-repos/1.0",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`GitHub Search HTTP ${res.status} query=${i}`);

    const json = (await res.json()) as {
      items?: {
        full_name: string;
        name: string;
        description?: string | null;
        language?: string | null;
        stargazers_count: number;
      }[];
    };

    for (const r of json.items ?? []) {
      const key = r.full_name.toLowerCase();
      if (seenRepos.has(key)) continue;
      seenRepos.add(key);
      allItems.push({
        repo: r.full_name,
        name: r.name,
        description: r.description ?? "",
        language: r.language ?? "",
        stars: r.stargazers_count,
      });
    }

    if (i < queryUrls.length - 1) {
      await new Promise((r) => setTimeout(r, SEARCH_DELAY_MS));
    }
  }

  // 3. フィルタ: 言語あり + ブロックリスト除外 + 既存除外
  const newRepos = allItems.filter((r) => {
    if (!r.language) return false;
    const name = r.repo.toLowerCase();
    if (BLOCKLIST.some((kw) => name.includes(kw))) return false;
    if (existingSet.has(name)) return false;
    return true;
  });

  console.log(
    JSON.stringify({
      type: "daily_repos_filtered",
      total: allItems.length,
      new_count: newRepos.length,
    }),
  );

  if (newRepos.length === 0) {
    const durationMs = Date.now() - start;
    const summary = `daily-repos${dryRun ? " (dry-run)" : ""}: 0件 / ${(durationMs / 1000).toFixed(1)}s`;
    console.log(
      JSON.stringify({
        type: "daily_repos_done",
        count: 0,
        duration_ms: durationMs,
        dry_run: dryRun,
      }),
    );
    if (!dryRun) {
      if (env.N8N_WEBHOOK_SECRET) {
        await notifyObs(env.N8N_WEBHOOK_SECRET, {
          severity: "info",
          subject: `✅ shirankedo daily-repos 完了 (0件 / ${(durationMs / 1000).toFixed(1)}s)`,
          summary,
        });
      }
      if (env.HC_PING_KEY)
        await pingHealthchecks(env.HC_PING_KEY, HC_SLUG, true, summary);
    }
    return;
  }

  // 4. Gemini 翻訳（20件バッチ）
  const BATCH_SIZE = 20;
  const batches: SearchRepoItem[][] = [];
  for (let i = 0; i < newRepos.length; i += BATCH_SIZE) {
    batches.push(newRepos.slice(i, i + BATCH_SIZE));
  }

  let geminiWarning: string | null = null;
  const translations: TranslatedRepo[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const lines = batch
      .map(
        (r, i) =>
          `${i + 1}. ${r.repo}: ${sanitizeForPrompt(r.description, 200) || "No description"}`,
      )
      .join("\n");

    const prompt = `以下のGitHubリポジトリについて、display_nameと説明文(description)を生成してください。

  ## display_nameルール
  - リポジトリの公式名称（README/サイトの表記）に合わせる
  - ハイフン区切りはスペース区切り+先頭大文字に（例: open-webui → Open WebUI）
  - 公式略称があればそれを使う（例: vscode → VS Code）

  ## descriptionルール
  - 10〜20文字の日本語
  - 体言止め（「〜ツール」「〜フレームワーク」「〜ライブラリ」等）
  - そのリポが何であるかを一言で表す。機能列挙はしない
  - 良い例: ローカルLLMランタイム、AI対応ワークフロー自動化、手書き風ホワイトボード
  - 悪い例: 監視ツール（短すぎ・曖昧）、OpenAIの代替となるセルフホスト型ローカルLLM推論エンジン（長すぎ）

  各行を「番号. display_name | description」の形式で返してください。

  ${lines}`;

    const geminiBody = buildGeminiRequest({
      prompt,
      temperature: 0.3,
      responseMimeType: null,
    });

    let text = "";
    try {
      const resp = await callGemini(
        env.GEMINI_API_KEY,
        "gemini-2.5-flash",
        geminiBody,
      );
      text = parseGeminiText(resp);
    } catch (e: unknown) {
      geminiWarning = geminiWarning ?? String(e); // 最初の失敗を記録
      text = "";
      console.log(
        JSON.stringify({
          type: "gemini_translate_repos_fallback",
          batch: batchIdx,
          error: String(e),
        }),
      );
    }

    const textLines = text.split("\n").filter((l) => /^\d+\./.test(l.trim()));
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const line = textLines[i] ?? "";
      const lineContent = line.replace(/^\d+\.\s*/, "").trim();
      const parts = lineContent.split("|").map((s) => s.trim());
      const displayName =
        parts.length >= 2 ? parts[0] : (r.repo.split("/")[1] ?? r.repo);
      const desc = parts.length >= 2 ? parts[1] : (r.description ?? "");
      translations.push({
        repo: r.repo,
        displayName,
        description: desc,
        language: r.language,
        stars: r.stars,
      });
    }

    if (batchIdx < batches.length - 1) {
      await new Promise((r) => setTimeout(r, SEARCH_DELAY_MS));
    }
  }

  const durationMs = Date.now() - start;
  const summary = `daily-repos${dryRun ? " (dry-run)" : ""}: ${translations.length}件 / ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_repos_done",
      count: translations.length,
      duration_ms: durationMs,
      dry_run: dryRun,
    }),
  );

  if (dryRun) return;

  const postFailures: string[] = [];

  // 5. tracking-repos UPSERT (D1 直接、50件チャンク)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < translations.length; i += CHUNK_SIZE) {
    const chunk = translations.slice(i, i + CHUNK_SIZE).map((r) => ({
      repo: r.repo,
      displayName: r.displayName,
      description: r.description,
      language: r.language,
    }));
    try {
      await processTrackingRepos(db, chunk);
    } catch (e: unknown) {
      postFailures.push(
        `tracking-repos chunk ${Math.floor(i / CHUNK_SIZE)}: ${String(e)}`,
      );
      console.log(
        JSON.stringify({
          type: "daily_repos_post_failed",
          chunk: Math.floor(i / CHUNK_SIZE),
          error: String(e),
        }),
      );
    }
  }

  // 6. repo-stats INSERT (D1 直接、新規リポのスター数)
  const statsBody = translations.map((r) => ({
    repo: r.repo,
    stars: r.stars,
  }));
  if (statsBody.length > 0) {
    try {
      await processRepoStats(db, statsBody);
    } catch (e: unknown) {
      postFailures.push(`repo-stats: ${String(e)}`);
      console.log(
        JSON.stringify({
          type: "daily_repos_stats_post_failed",
          error: String(e),
        }),
      );
    }
  }

  const postFailed = postFailures.length > 0 ? postFailures.join(" / ") : null;

  if (env.N8N_WEBHOOK_SECRET) {
    const ok = !postFailed && !geminiWarning;
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: ok ? "info" : "warning",
      subject: postFailed
        ? `❌ shirankedo daily-repos DB書込失敗 (${translations.length}件 / ${(durationMs / 1000).toFixed(1)}s)`
        : geminiWarning
          ? `⚠️ shirankedo daily-repos 完了(AI翻訳失敗) (${translations.length}件 / ${(durationMs / 1000).toFixed(1)}s)`
          : `✅ shirankedo daily-repos 完了 (${translations.length}件 / ${(durationMs / 1000).toFixed(1)}s)`,
      summary: postFailed ? `${summary} | DB書込失敗: ${postFailed}` : summary,
    });
    if (!r.ok)
      console.log(
        JSON.stringify({ type: "obs_notify_failed", error: r.error }),
      );
  }

  if (env.HC_PING_KEY) {
    const r = await pingHealthchecks(
      env.HC_PING_KEY,
      HC_SLUG,
      !postFailed,
      summary,
    );
    if (!r.ok)
      console.log(JSON.stringify({ type: "hc_ping_failed", error: r.error }));
  }
}
