import { getDb } from "../../db/client";
import { repoStats, trackingRepos } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { buildStarBatches, type StarBatch } from "./build-star-batches";

const GH_GRAPHQL = "https://api.github.com/graphql";
const BATCH_INTERVAL_MS = 200; // GitHub secondary rate limit 回避
const HC_BASE = "https://hc-ping.com";
const HC_SLUG = "shirankedo-daily-stars";
/** D1 INSERT のチャンクサイズ。776 行を 50 行ずつにまとめて subrequest 数を抑える。 */
const INSERT_CHUNK = 50;
/** wrangler.jsonc の triggers.crons と同期させる。両方を必ず一緒に変更すること。 */
export const DAILY_STARS_CRON = "0 18 * * *";

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
  DISCORD_WEBHOOK_URL_DAILY_STARS?: string;
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

async function fetchBatch(
  batch: StarBatch,
  token: string,
): Promise<BatchResult> {
  const res = await fetch(GH_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "shirankedo-daily-stars/1.0",
    },
    body: JSON.stringify({ query: batch.query }),
  });
  if (!res.ok) {
    throw new Error(
      `GitHub GraphQL HTTP ${res.status} batch=${batch.batchIndex}`,
    );
  }
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

async function notifyDiscord(
  url: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  return safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
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

/** Cron Trigger 本体: tracking_repos → GraphQL star fetch → repo_stats bulk INSERT */
export async function runDailyStars(env: DailyStarsEnv): Promise<{
  inserted: number;
  renamed: number;
  durationMs: number;
  dryRun: boolean;
}> {
  const start = Date.now();
  const dryRun = env.DAILY_STARS_ENABLED !== "true";
  const db = getDb(env.DB);

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

  // 4. D1 bulk INSERT（dry-run 時はスキップ。50 行/subrequest で Free tier 50 制限内に収める）
  let inserted = 0;
  if (!dryRun) {
    for (let i = 0; i < allStars.length; i += INSERT_CHUNK) {
      const chunk = allStars.slice(i, i + INSERT_CHUNK);
      await queryD1("daily_stars.repo_stats.insert_bulk", () =>
        db.insert(repoStats).values(chunk),
      );
      inserted += chunk.length;
    }
  }

  const durationMs = Date.now() - start;
  const summary = `daily-stars${dryRun ? " (dry-run)" : ""}: ${allStars.length} stars / ${allRenames.length} renames / ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_stars_done",
      fetched: allStars.length,
      inserted,
      renamed: allRenames.length,
      duration_ms: durationMs,
      dry_run: dryRun,
    }),
  );

  // 5. Discord 通知（dry-run 時はスキップ）
  if (!dryRun && env.DISCORD_WEBHOOK_URL_DAILY_STARS) {
    let message = summary;
    if (allRenames.length) {
      const lines = allRenames.slice(0, 10).map((r) => `- ${r.from} → ${r.to}`);
      message += `\nリネーム検知:\n${lines.join("\n")}`;
    }
    const r = await notifyDiscord(env.DISCORD_WEBHOOK_URL_DAILY_STARS, message);
    if (!r.ok) {
      console.log(
        JSON.stringify({ type: "discord_notify_failed", error: r.error }),
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
    durationMs,
    dryRun,
  };
}
