import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { repoStats, trackingRepos } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { buildStarBatches, type StarBatch } from "./build-star-batches";

const GH_GRAPHQL = "https://api.github.com/graphql";
const BATCH_INTERVAL_MS = 200; // GitHub secondary rate limit 回避
// 5xx (GitHub / CF egress proxy 一時障害) を吸収する retry。 daily-releases.ts と
// 同等の policy。 5/7 検証で本番 cron context で連続 5xx 死亡を確認したため、
// MAX_ATTEMPTS を 5 に増やし exponential backoff で max 30s 待つ。
const MAX_ATTEMPTS = 5;
const RETRY_SLEEP_CAP_MS = 30000;
const HC_BASE = "https://hc-ping.com";
const HC_SLUG = "shirankedo-daily-stars";
/**
 * 観測性通知は n8n の api/obs-notify 経由 (#529)。
 * severity 別 Discord channel + Notion 観測性ログ DB は obs-notify WF が担当。
 */
const N8N_OBS_NOTIFY = "https://yushin-n8n.duckdns.org/webhook/obs-notify";
/** D1 INSERT のチャンクサイズ。776 行を 50 行ずつにまとめて subrequest 数を抑える。 */
const INSERT_CHUNK = 50;
/**
 * wrangler.jsonc の triggers.crons と同期させる。両方を必ず一緒に変更すること。
 * 5/7 一時検証 5th: UTC 00:15 = JST 09:15 (BATCH 200 + timeout 30s 後)。
 * 本番 schedule (UTC 15:05 = JST 00:05) は検証完了後に revert PR で戻す。
 */
export const DAILY_STARS_CRON = "15 0 * * *";

/**
 * runDailyStars が利用する env binding。`src/env.d.ts` の `cloudflare:workers`
 * env から DB を、cron 用 secret は本ファイルで個別宣言（main の env.d.ts に
 * 余計な type を増やさず、scope を本 cron 内に閉じる方針）。
 *
 * `DAILY_STARS_ENABLED !== "true"` のときは dry-run（D1 INSERT・通知・ping
 * を全スキップ）。本番並走時のデータ重複を避ける安全装置。
 */
export interface DailyStarsEnv {
  DB: D1Database;
  GITHUB_TOKEN: string;
  /**
   * n8n の api/obs-notify webhook を叩くための共通 secret (#529)。
   * 未設定なら通知をスキップ。
   */
  N8N_WEBHOOK_SECRET?: string;
  HC_PING_KEY?: string;
  DAILY_STARS_ENABLED?: string;
}

interface StarRow {
  repo: string;
  stars: number;
}

interface RenameRow {
  from: string;
  to: string;
}

interface BatchResult {
  stars: StarRow[];
  renames: RenameRow[];
}

export async function fetchBatch(
  batch: StarBatch,
  token: string,
): Promise<BatchResult> {
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 5/7 検証 4th: fetch hung 対策で 10s timeout
    try {
      res = await fetch(GH_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "shirankedo-daily-stars/1.0",
        },
        body: JSON.stringify({ query: batch.query }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        const sleepMs = Math.min(attempt * 1000, RETRY_SLEEP_CAP_MS);
        console.log(
          JSON.stringify({
            type: "graphql_timeout",
            batch: batch.batchIndex,
            error: String(e).substring(0, 100),
            attempt,
            sleep_ms: sleepMs,
          }),
        );
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      throw new Error(
        `GitHub GraphQL fetch failed batch=${batch.batchIndex} (after ${attempt} attempts): ${String(e).substring(0, 200)}`,
      );
    }
    if (res.ok) break;
    // 5xx は GitHub / CF egress proxy 一時障害、 retry 価値あり
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      // 5/7 検証 3rd: exponential は wall time 圧迫で silent kill 原因。
      // linear (累計 10s) に戻す。 MAX_ATTEMPTS=5 は 504 吸収のため維持。
      const sleepMs = Math.min(attempt * 1000, RETRY_SLEEP_CAP_MS);
      console.log(
        JSON.stringify({
          type: "graphql_retry",
          batch: batch.batchIndex,
          status: res.status,
          attempt,
          sleep_ms: sleepMs,
        }),
      );
      await new Promise((r) => setTimeout(r, sleepMs));
      continue;
    }
    throw new Error(
      `GitHub GraphQL HTTP ${res.status} batch=${batch.batchIndex} (after ${attempt} attempts)`,
    );
  }
  if (!res) throw new Error("unreachable");
  const json = (await res.json()) as {
    data?: Record<
      string,
      { nameWithOwner: string; stargazerCount: number } | null
    >;
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    // partial errors も data があれば続行
    console.log(
      JSON.stringify({
        type: "graphql_partial_error",
        batch: batch.batchIndex,
        errors: json.errors.slice(0, 3),
      }),
    );
  }
  const data = json.data ?? {};
  const stars: StarRow[] = [];
  const renames: RenameRow[] = [];
  for (const [alias, repo] of Object.entries(data)) {
    if (!repo?.nameWithOwner) continue;
    stars.push({ repo: repo.nameWithOwner, stars: repo.stargazerCount });
    const original = batch.repoMap[alias];
    if (original && original !== repo.nameWithOwner) {
      renames.push({ from: original, to: repo.nameWithOwner });
    }
  }
  return { stars, renames };
}

/**
 * 副作用通知（Discord/Healthchecks）の共通 fetch ラッパ。
 * 失敗を WF 全体失敗にせず Result で呼び出し元に返す（呼び出し元はログ記録のみ）。
 */
async function safeFetch(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, init);
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

async function notifyObs(
  webhookSecret: string,
  payload: {
    severity: "critical" | "warning" | "info";
    subject: string;
    summary?: string;
    raw_payload?: unknown;
  },
): Promise<{ ok: boolean; error?: string }> {
  return safeFetch(N8N_OBS_NOTIFY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": webhookSecret,
    },
    body: JSON.stringify({
      ...payload,
      service: "cf-worker",
      repo: "shirankedo",
    }),
  });
}

/** Healthchecks ping（成功・失敗両方の経路で使う、非ブロッキング前提）。 */
export async function pingHealthchecks(
  pingKey: string,
  ok: boolean,
  body?: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${HC_BASE}/${pingKey}/${HC_SLUG}${ok ? "" : "/fail"}`;
  return safeFetch(url, { method: "POST", body: body ?? "" });
}

/**
 * GitHub の rename 検出結果を tracking_repos に反映する。
 *
 * 設計判断 (#net-task: rename 反映):
 * - tracking_repos のみ UPDATE。repo_stats / releases は旧名で履歴を残す
 *   （次回 cron 以降は新名で蓄積される）。
 * - UNIQUE 制約衝突 (新名 row が既存) なら旧名を DELETE（孤児）。GitHub 側で
 *   既に新名 repository が存在するケース。
 * - dry-run 時は何もせず skipped 扱い。
 *
 * 戻り値の applied / skipped は obs-notify summary に反映して履歴を残す。
 */
export async function applyRenames(
  db: ReturnType<typeof getDb>,
  renames: RenameRow[],
  dryRun: boolean,
): Promise<{ applied: number; skipped: number; errors: number }> {
  if (dryRun || renames.length === 0) {
    return { applied: 0, skipped: renames.length, errors: 0 };
  }

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const { from, to } of renames) {
    if (from === to) {
      skipped++;
      continue;
    }
    try {
      const existing = await db
        .select({ repo: trackingRepos.repo })
        .from(trackingRepos)
        .where(eq(trackingRepos.repo, to))
        .limit(1);
      if (existing.length > 0) {
        // 新名 row が既存 → 旧名 row を孤児として削除
        await db.delete(trackingRepos).where(eq(trackingRepos.repo, from));
      } else {
        await db
          .update(trackingRepos)
          .set({ repo: to })
          .where(eq(trackingRepos.repo, from));
      }
      applied++;
    } catch (e) {
      errors++;
      console.log(
        JSON.stringify({
          type: "daily_stars_rename_failed",
          from,
          to,
          error: String(e),
        }),
      );
    }
  }

  return { applied, skipped, errors };
}

/**
 * GraphQL POST 前に軽量な GET /zen を 1 回叩いて egress 経路をウォームアップ。
 * 5/7 cron context での連続 5xx 切り分け用。 失敗時も本処理に進む (catch 握り潰し)。
 */
async function warmUpEgress(env: DailyStarsEnv): Promise<void> {
  const t0 = Date.now();
  try {
    const res = await fetch("https://api.github.com/zen", {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "shirankedo-daily-stars/warmup",
      },
    });
    console.log(
      JSON.stringify({
        type: "warmup_done",
        status: res.status,
        duration_ms: Date.now() - t0,
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        type: "warmup_fail",
        error: String(e),
        duration_ms: Date.now() - t0,
      }),
    );
  }
}

/** Cron Trigger 本体: tracking_repos → GraphQL star fetch → repo_stats bulk INSERT */
export async function runDailyStars(env: DailyStarsEnv): Promise<{
  inserted: number;
  renamed: number;
  renamesApplied: number;
  renamesSkipped: number;
  durationMs: number;
  dryRun: boolean;
}> {
  const start = Date.now();
  const dryRun = env.DAILY_STARS_ENABLED !== "true";
  const db = getDb(env.DB);

  // 0. warm-up fetch: 5/7 検証 — cron context での最初の egress fetch が CF
  //    proxy に弾かれる仮説の対策。 GET /zen は軽量、 失敗しても本処理に進む。
  await warmUpEgress(env);

  // 1. tracking_repos 取得
  const repos = await queryD1("daily_stars.tracking_repos.select", () =>
    db.select({ repo: trackingRepos.repo }).from(trackingRepos),
  );
  console.log(
    JSON.stringify({
      type: "daily_stars_start",
      tracking_count: repos.length,
      dry_run: dryRun,
    }),
  );

  // 2. バッチ作成
  const batches = buildStarBatches(repos);

  // 3. 順次 fetch（GitHub secondary rate limit 回避のため間隔を空ける）
  const allStars: StarRow[] = [];
  const allRenames: RenameRow[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await fetchBatch(batch, env.GITHUB_TOKEN);
    allStars.push(...result.stars);
    allRenames.push(...result.renames);
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
    }
  }

  // 4. D1 bulk INSERT（dry-run 時はスキップ）
  // subrequest 削減のため `db.batch([...])` で複数 statement を 1 リクエストに集約。
  // - chunk size 50 の理由: 1 statement あたり 50 行 × 2 カラム = 100 params で
  //   SQLITE_MAX_VARIABLE_NUMBER=100 上限ピッタリ。これ以上は params 超過で失敗する。
  // - 2068 リポなら ~42 statements を 1 batch 呼び出しに集約 → subrequest 1 のみ消費。
  let inserted = 0;
  if (!dryRun) {
    // drizzle d1 の `db.batch()` は readonly tuple `[BatchItem, ...BatchItem[]]` を
    // 要求するため、動的構築のリストを Parameters 型で受ける。
    type BatchInput = Parameters<typeof db.batch>[0];
    const stmts: BatchInput = [] as unknown as BatchInput;
    for (let i = 0; i < allStars.length; i += INSERT_CHUNK) {
      const chunk = allStars.slice(i, i + INSERT_CHUNK);
      (stmts as unknown as unknown[]).push(db.insert(repoStats).values(chunk));
    }
    if ((stmts as unknown as unknown[]).length > 0) {
      await queryD1("daily_stars.repo_stats.insert_batch", () =>
        db.batch(stmts),
      );
      inserted = allStars.length;
    }
  }

  // 4.5. rename 適用（tracking_repos のみ UPDATE。repo_stats / releases は履歴保持）
  const renameResult = await queryD1(
    "daily_stars.tracking_repos.rename_apply",
    () => applyRenames(db, allRenames, dryRun),
  );

  const durationMs = Date.now() - start;
  const summary = `daily-stars${dryRun ? " (dry-run)" : ""}: ${allStars.length} stars / ${allRenames.length} renames (applied=${renameResult.applied} skipped=${renameResult.skipped} errors=${renameResult.errors}) / ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_stars_done",
      fetched: allStars.length,
      inserted,
      renamed: allRenames.length,
      renames_applied: renameResult.applied,
      renames_skipped: renameResult.skipped,
      renames_errors: renameResult.errors,
      duration_ms: durationMs,
      dry_run: dryRun,
    }),
  );

  // 5. 観測性通知（dry-run 時はスキップ、n8n obs-notify 経由 / severity=info）
  if (!dryRun && env.N8N_WEBHOOK_SECRET) {
    let summaryText = summary;
    if (allRenames.length) {
      const lines = allRenames.slice(0, 10).map((r) => `- ${r.from} → ${r.to}`);
      summaryText += `\nリネーム検知 (適用 ${renameResult.applied} / 失敗 ${renameResult.errors}):\n${lines.join("\n")}`;
    }
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: "info",
      subject: `✅ shirankedo daily-stars 完了 (${allStars.length}件 / ${(durationMs / 1000).toFixed(1)}s)`,
      summary: summaryText,
    });
    if (!r.ok) {
      console.log(
        JSON.stringify({ type: "obs_notify_failed", error: r.error }),
      );
    }
  }

  // 6. Healthchecks 成功 ping（dry-run 時はスキップ）
  if (!dryRun && env.HC_PING_KEY) {
    const r = await pingHealthchecks(env.HC_PING_KEY, true, summary);
    if (!r.ok) {
      console.log(JSON.stringify({ type: "hc_ping_failed", error: r.error }));
    }
  }

  return {
    inserted,
    renamed: allRenames.length,
    renamesApplied: renameResult.applied,
    renamesSkipped: renameResult.skipped,
    durationMs,
    dryRun,
  };
}
