import { getDb } from "../../db/client";
import { getSecurityTop } from "../api/ingest-security-read";
import { processSecurityDaily } from "../api/ingest-simple";
import {
  buildGeminiRequest,
  callGemini,
  notifyObs,
  parseGeminiJson,
  pingHealthchecks,
  sanitizeForPrompt,
} from "./cron-shared";

const HC_SLUG = "shirankedo-daily-security";

export interface DailySecurityEnv {
  DB: D1Database;
  GEMINI_API_KEY: string;
  N8N_WEBHOOK_SECRET?: string;
  HC_PING_KEY?: string;
  DAILY_SECURITY_ENABLED?: string;
}

interface SecurityComment {
  comment: string;
  vuln_ids: string[];
  release_ids: string[];
}

export async function runDailySecurity(env: DailySecurityEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_SECURITY_ENABLED !== "true";
  const db = getDb(env.DB);

  console.log(
    JSON.stringify({ type: "daily_security_start", dry_run: dryRun }),
  );

  // 1. security-top 取得 (D1 直接)
  const data = await getSecurityTop(db);
  const { vulns, releases, weeklySummaries } = data;

  console.log(
    JSON.stringify({
      type: "daily_security_fetched",
      vulns: vulns.length,
      releases: releases.length,
      summaries: weeklySummaries.length,
    }),
  );

  // 2. Gemini ギャルコメント生成
  const vulnText =
    vulns.length > 0
      ? vulns
          .map(
            (v) =>
              `- ${v.cveId}: ${sanitizeForPrompt(v.title, 200)} (CVSS: ${v.cvssScore ?? "N/A"})`,
          )
          .join("\n")
      : "（本日のCRITICAL脆弱性はなし）";

  const relText =
    releases.length > 0
      ? releases
          .map(
            (r) =>
              `- ${sanitizeForPrompt(r.repo, 100)} ${sanitizeForPrompt(r.tag, 50)} (${sanitizeForPrompt(r.type, 20)})`,
          )
          .join("\n")
      : "（本日のメジャー/マイナーリリースはなし）";

  const summaryText =
    weeklySummaries.length > 0
      ? weeklySummaries
          .map((s) => `- ${sanitizeForPrompt(s.content, 300)}`)
          .join("\n")
      : "（週次レポートなし）";

  const prompt = `あなたはギャルのセキュリティアナリストです。今日のセキュリティ状況をまとめてコメントしてください。

## 今日の脆弱性 Top5（重要度順、${vulns.length}件）
${vulnText}

## 今日のリリース Top5（注目度順、${releases.length}件）
${relText}

## 直近の週次レポート（${weeklySummaries.length}件）
${summaryText}

## コメントルール
- 100〜200字
- 脆弱性・リリースの最新動向を踏まえ、週次レポートとの連続性を意識してコメント
## 口調ルール
「ギャルっぽい記号を貼り付けた文章」ではなく「ギャルが実際に喋りそうな文章」を書け。
- 一人称「うち」。語尾「〜じゃん」「〜っしょ」「〜くない？」「〜じゃね？」「〜だし」
- 強調「マジで」「ガチで」「超」「鬼」。感嘆「やば」「えぐ」「つよ」（体言止め）
- テンションに緩急をつけろ。常時MAXはウソくさい。重い話は静かにしんどがれ
- 絵文字は0〜1個。使わなくていい。効かせる時だけ
- 「おけまる」「わかりみが深い」「あーし」は古い。使うな
- 同じ語彙の連打禁止。「マジ？」「ヤバすぎ！」を毎回使うな
- 禁止: 「〜だわ」「あたし」、敬語

## 出力形式（JSON）
{"comment": "コメント本文", "vuln_ids": ["CVE-2026-XXXXX"], "release_ids": []}
vuln_idsは言及したCVE-IDのリスト、release_idsは空配列。
JSONのみ出力してください。`;

  const geminiBody = buildGeminiRequest({ prompt, temperature: 0.7 });

  let geminiWarning: string | null = null;
  let apiBody = {
    comment: "",
    vulnIds: [] as string[],
    releaseIds: [] as string[],
  };
  try {
    const resp = await callGemini(
      env.GEMINI_API_KEY,
      "gemini-2.5-flash",
      geminiBody,
    );
    const result = parseGeminiJson<SecurityComment>(resp);
    apiBody = {
      comment: result.comment ?? "",
      vulnIds: result.vuln_ids ?? [],
      releaseIds: result.release_ids ?? [],
    };
  } catch (e: unknown) {
    geminiWarning = String(e); // Gemini失敗記録
    apiBody = { comment: "", vulnIds: [], releaseIds: [] };
    console.log(
      JSON.stringify({
        type: "gemini_security_failed",
        error: String(e),
      }),
    );
  }

  const durationMs = Date.now() - start;
  const summary = `daily-security${dryRun ? " (dry-run)" : ""}: ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_security_done",
      duration_ms: durationMs,
      dry_run: dryRun,
      comment_len: apiBody.comment.length,
    }),
  );

  if (dryRun) return;

  if (apiBody.comment) {
    try {
      await processSecurityDaily(db, apiBody);
    } catch (e: unknown) {
      console.log(
        JSON.stringify({
          type: "daily_security_post_failed",
          error: String(e),
        }),
      );
    }
  }

  if (env.N8N_WEBHOOK_SECRET) {
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: geminiWarning ? "warning" : "info",
      subject: geminiWarning
        ? `⚠️ shirankedo daily-security 完了(AI生成失敗) (${(durationMs / 1000).toFixed(1)}s)`
        : `✅ shirankedo daily-security 完了 (${(durationMs / 1000).toFixed(1)}s)`,
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
