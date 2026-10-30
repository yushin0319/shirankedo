import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { repoStats, trackingRepos } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import {
  buildStarBatches,
  buildStarSubBatch,
  type StarBatch,
} from "./build-star-batches";
import { fetchWithRetry } from "./cron-shared";

const GH_GRAPHQL = "https://api.github.com/graphql";
const BATCH_INTERVAL_MS = 200; // GitHub secondary rate limit 回避
/**
 * GitHub は 150 件の問い合わせを RESOURCE_LIMITS_EXCEEDED で打ち切り、バッチのほぼ全件を
 * null で返すことがある。null になった分は半分の 75 件ずつで問い合わせ直す。
 */
const REFETCH_CHUNK = 75;
/** 取り直しも上限超過なら、さらに半分に割って問い合わせる回数 (75 → 37/38 の 1 段まで) */
const MAX_REFETCH_SPLITS = 1;
/** Cloudflare Workers Free の 1 実行あたり subrequest 上限 */
const SUBREQUEST_LIMIT = 50;
/** GraphQL 以外の subrequest: warm-up 1 + obs-notify 1 + HC ping 1 */
const NON_GRAPHQL_SUBREQUESTS = 3;
/** fetchWithRetry の再試行 (403 / 5xx / timeout) で増える分として空けておく数 */
const RETRY_RESERVE = 5;
/** 1 実行あたりの取り直しの問い合わせ回数の上限 */
const MAX_REFETCH_REQUESTS = 6;
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
 * 本番 schedule: UTC 15:05 = JST 00:05 (5/8 検証 11 phases 完了後に復帰)。
 */
export const DAILY_STARS_CRON = "5 15 * * *";

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

interface RefetchStats {
  /** 取り直しの問い合わせ回数 (= 増えた subrequest 数) */
  requests: number;
  /** 取り直しで取れた件数 */
  recovered: number;
  /** 取り直しても取れなかった件数 (回数の上限で取り直せなかった分を含む) */
  unrecovered: number;
}

interface BatchResult {
  stars: StarRow[];
  renames: RenameRow[];
  refetch: RefetchStats;
}

/** 取り直しの残り回数。1 実行の中で全バッチが 1 つを共有して減らす */
export interface RefetchBudget {
  remaining: number;
}

interface StarsResponse {
  data?: Record<
    string,
    { nameWithOwner: string; stargazerCount: number } | null
  > | null;
  errors?: { type?: string; path?: (string | number)[]; message: string }[];
}

/**
 * 1 実行で取り直しに使ってよい問い合わせ回数。subrequest 上限から、本体のバッチ数・
 * GraphQL 以外の分・再試行の予備を引いた残りを、MAX_REFETCH_REQUESTS まで使う。
 */
export function refetchBudgetFor(batchCount: number): number {
  const spare =
    SUBREQUEST_LIMIT - NON_GRAPHQL_SUBREQUESTS - RETRY_RESERVE - batchCount;
  return Math.max(0, Math.min(MAX_REFETCH_REQUESTS, spare));
}

/** GraphQL を 1 回投げて JSON を返す。本文が JSON として読めなければ null */
async function requestStars(
  batch: StarBatch,
  token: string,
  maxAttempts?: number,
): Promise<StarsResponse | null> {
  // retry policy は cron-shared.fetchWithRetry に集約 (3 cron 横断で共有)。
  // 5xx / 403 secondary rate limit / 401 一過性 auth / timeout を吸収。
  const res = await fetchWithRetry(
    GH_GRAPHQL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "shirankedo-daily-stars/1.0",
      },
      body: JSON.stringify({ query: batch.query }),
    },
    {
      label: "GitHub GraphQL",
      context: `batch=${batch.batchIndex}`,
      maxAttempts,
    },
  );
  // 5/7 検証 7th: response body 途中切断で SyntaxError → batch スキップで完走。
  let json: StarsResponse;
  try {
    const text = await res.text();
    json = JSON.parse(text);
  } catch (e) {
    console.log(
      JSON.stringify({
        type: "graphql_parse_fail",
        batch: batch.batchIndex,
        error: String(e).substring(0, 200),
      }),
    );
    return null;
  }
  if (json.errors?.length) {
    // partial errors も data があれば続行
    console.log(
      JSON.stringify({
        type: "graphql_partial_error",
        batch: batch.batchIndex,
        queried: Object.keys(batch.repoMap).length,
        error_count: json.errors.length,
        errors: json.errors.slice(0, 3),
      }),
    );
  }
  return json;
}

/**
 * 応答から star 数と rename を読み取る。missing は data が null で、NOT_FOUND
 * (削除・改名で見つからないリポ) でもないエイリアス = 取り直す候補。
 */
function readStars(batch: StarBatch, json: StarsResponse) {
  const data = json.data ?? {};
  const errors = json.errors ?? [];
  const notFound = new Set(
    errors.filter((e) => e.type === "NOT_FOUND").map((e) => e.path?.[0]),
  );
  const stars: StarRow[] = [];
  const renames: RenameRow[] = [];
  const missing: string[] = [];
  for (const [alias, original] of Object.entries(batch.repoMap)) {
    const repo = data[alias];
    if (!repo?.nameWithOwner) {
      if (!notFound.has(alias)) missing.push(alias);
      continue;
    }
    stars.push({ repo: repo.nameWithOwner, stars: repo.stargazerCount });
    if (original !== repo.nameWithOwner) {
      renames.push({ from: original, to: repo.nameWithOwner });
    }
  }
  const resourceLimited = errors.some(
    (e) => e.type === "RESOURCE_LIMITS_EXCEEDED",
  );
  return { stars, renames, missing, resourceLimited };
}

export async function fetchBatch(
  batch: StarBatch,
  token: string,
  budget: RefetchBudget = { remaining: MAX_REFETCH_REQUESTS },
): Promise<BatchResult> {
  const refetch: RefetchStats = { requests: 0, recovered: 0, unrecovered: 0 };
  const json = await requestStars(batch, token);
  if (!json) return { stars: [], renames: [], refetch };
  const first = readStars(batch, json);
  if (!first.resourceLimited || first.missing.length === 0) {
    return { stars: first.stars, renames: first.renames, refetch };
  }

  // RESOURCE_LIMITS_EXCEEDED で null になった分だけ、小さい問い合わせで取り直す。
  // 取り直しも上限超過なら半分に割る (MAX_REFETCH_SPLITS 段まで)。
  // 問い合わせ 1 回 = subrequest 1 回にするため fetchWithRetry の再試行はせず (maxAttempts 1)、
  // 回数は 1 実行で共有する budget で抑える。取れなかった分は unrecovered に数えて表に出す。
  const stars = [...first.stars];
  const renames = [...first.renames];
  const queue: { aliases: string[]; splits: number }[] = [];
  for (let i = 0; i < first.missing.length; i += REFETCH_CHUNK) {
    queue.push({
      aliases: first.missing.slice(i, i + REFETCH_CHUNK),
      splits: 0,
    });
  }
  for (let job = queue.shift(); job; job = queue.shift()) {
    if (budget.remaining <= 0) {
      refetch.unrecovered += job.aliases.length;
      continue;
    }
    budget.remaining -= 1;
    refetch.requests += 1;
    await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
    const sub = buildStarSubBatch(batch, job.aliases);
    let res: StarsResponse | null = null;
    try {
      res = await requestStars(sub, token, 1);
    } catch (e) {
      console.log(
        JSON.stringify({
          type: "graphql_refetch_failed",
          batch: batch.batchIndex,
          queried: job.aliases.length,
          error: String(e).substring(0, 200),
        }),
      );
    }
    if (!res) {
      refetch.unrecovered += job.aliases.length;
      continue;
    }
    const got = readStars(sub, res);
    stars.push(...got.stars);
    renames.push(...got.renames);
    refetch.recovered += got.stars.length;
    if (
      got.resourceLimited &&
      got.missing.length > 1 &&
      job.splits < MAX_REFETCH_SPLITS
    ) {
      const half = Math.ceil(got.missing.length / 2);
      queue.push(
        { aliases: got.missing.slice(0, half), splits: job.splits + 1 },
        { aliases: got.missing.slice(half), splits: job.splits + 1 },
      );
    } else {
      refetch.unrecovered += got.missing.length;
    }
  }
  console.log(
    JSON.stringify({
      type: "graphql_refetch",
      batch: batch.batchIndex,
      missing: first.missing.length,
      requests: refetch.requests,
      recovered: refetch.recovered,
      unrecovered: refetch.unrecovered,
      budget_left: budget.remaining,
    }),
  );
  return { stars, renames, refetch };
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
 * - tracking_repos のみ UPDATE。repo_stats は旧名で履歴を残す
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
  const refetchBudget: RefetchBudget = {
    remaining: refetchBudgetFor(batches.length),
  };

  // 3. 順次 fetch（GitHub secondary rate limit 回避のため間隔を空ける）
  const allStars: StarRow[] = [];
  const allRenames: RenameRow[] = [];
  const failedBatches: number[] = [];
  const refetch: RefetchStats = { requests: 0, recovered: 0, unrecovered: 0 };
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    // retry を尽くしても落ちた 1 batch で全日データ (~2700件) を失わないよう、
    // 該当 batch だけ skip して継続する (parse-fail 経路と同じ graceful 思想)。
    // skip は後段の obs-notify warning で必ず表に出す (silent truncation 禁止)。
    try {
      const result = await fetchBatch(batch, env.GITHUB_TOKEN, refetchBudget);
      allStars.push(...result.stars);
      allRenames.push(...result.renames);
      refetch.requests += result.refetch.requests;
      refetch.recovered += result.refetch.recovered;
      refetch.unrecovered += result.refetch.unrecovered;
    } catch (e) {
      failedBatches.push(batch.batchIndex);
      console.log(
        JSON.stringify({
          type: "batch_skipped",
          batch: batch.batchIndex,
          error: String(e).substring(0, 200),
        }),
      );
    }
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
    }
  }

  // 全 batch が落ちたケース (例: token 失効 / GitHub 全断) は graceful skip で
  // 握り潰さず従来どおり throw する。worker.ts の catch → logCronError +
  // HC fail ping (DOWN 通知) に乗せ、部分欠損 (warning) と区別して loud に出す。
  if (batches.length > 0 && failedBatches.length === batches.length) {
    throw new Error(
      `daily-stars: all ${batches.length} batches failed (GitHub auth/outage の疑い)`,
    );
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

  // 4.5. rename 適用（tracking_repos のみ UPDATE。repo_stats は履歴保持）
  const renameResult = await queryD1(
    "daily_stars.tracking_repos.rename_apply",
    () => applyRenames(db, allRenames, dryRun),
  );

  const durationMs = Date.now() - start;
  const failedNote = failedBatches.length
    ? ` / ⚠ skipped_batches=${failedBatches.length} (${failedBatches.join(",")})`
    : "";
  const refetchNote =
    refetch.requests || refetch.unrecovered
      ? ` / refetch=${refetch.requests} recovered=${refetch.recovered}${refetch.unrecovered ? ` / ⚠ unrecovered=${refetch.unrecovered}` : ""}`
      : "";
  const summary = `daily-stars${dryRun ? " (dry-run)" : ""}: ${allStars.length} stars / ${allRenames.length} renames (applied=${renameResult.applied} skipped=${renameResult.skipped} errors=${renameResult.errors}) / ${(durationMs / 1000).toFixed(1)}s${failedNote}${refetchNote}`;
  console.log(
    JSON.stringify({
      type: "daily_stars_done",
      fetched: allStars.length,
      inserted,
      renamed: allRenames.length,
      renames_applied: renameResult.applied,
      renames_skipped: renameResult.skipped,
      renames_errors: renameResult.errors,
      skipped_batches: failedBatches.length,
      refetch_requests: refetch.requests,
      refetch_recovered: refetch.recovered,
      refetch_unrecovered: refetch.unrecovered,
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
    // 一部 batch を skip した日・取り直しても取れなかったリポがある日は info で
    // 埋もれさせず warning に上げる (朝確認すべき部分欠損。欠けが無ければ info)。
    const losses: string[] = [];
    if (failedBatches.length) losses.push(`${failedBatches.length} batch skip`);
    if (refetch.unrecovered)
      losses.push(`取り直し失敗 ${refetch.unrecovered} 件`);
    const hasFailed = losses.length > 0;
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: hasFailed ? "warning" : "info",
      subject: hasFailed
        ? `⚠ shirankedo daily-stars 部分欠損 (${allStars.length}件取得 / ${losses.join(" / ")})`
        : `✅ shirankedo daily-stars 完了 (${allStars.length}件 / ${(durationMs / 1000).toFixed(1)}s)`,
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
