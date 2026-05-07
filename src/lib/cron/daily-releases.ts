import { getDb } from "../../db/client";
import { getTrackingRepos, processReleases } from "../api/ingest-upsert";
import { notifyObs, pingHealthchecks, sanitizeGitHubName } from "./cron-shared";

const GH_GRAPHQL = "https://api.github.com/graphql";
const HC_SLUG = "shirankedo-daily-releases";
// 検証履歴:
// - PR #153 (1 query × 2143 alias): GitHub HTTP 500 (body 過大)
// - PR #154 (Promise.all × 6 batch × 400 alias): 全 batch HTTP 502
// - PR #155 (sequential × 22 batch × 100 alias): 213s 完走 (5/6 04:00 時点)
// - 5/7 00:10 JST: sequential 100 alias で batch=0 連続 504
// - 5/7 01:40 JST (PR #162 BATCH 50, exponential): batch 10/11/13/17 504
//   sleep 累計 wall time 圧迫 → silent kill
// - 5/7 08:20 JST (PR #163 sleep linear): 504 ゼロ、 batch 12/13 後 silent kill
// - 5/7 08:50 JST (PR #164 BATCH 20 + timeout 10s): batch 30 後 silent kill
// - 5/7 09:20 JST (PR #165 BATCH 200 + timeout 30s): cron 完走 115s だが
//   GitHub GraphQL "Resource limits exceeded" で全 batch 0件。 200 alias は
//   release(first:5)=1000 node で GitHub complexity 上限超過。
// - 本 PR: PR #155 sweet spot の BATCH_SIZE 100 に戻す + timeout 30s +
//   linear sleep + MAX_ATTEMPTS 5。 22 batch sequential、 GitHub node 内、
//   subreq 22 + α で 50 上限内。
const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 200;
// 5/7 検証: 本番 cron context で batch=0 が連続 502 で死亡。 ローカル curl は同
// query 200 OK のため CF egress proxy or cron context 起因疑い。 retry 上限を
// 増やしつつ exponential backoff で長めに待つ。 max sleep 30s × MAX_ATTEMPTS-1。
const MAX_ATTEMPTS = 5;
const RETRY_SLEEP_CAP_MS = 30000;

export interface DailyReleasesEnv {
  DB: D1Database;
  GITHUB_TOKEN: string;
  N8N_WEBHOOK_SECRET?: string;
  HC_PING_KEY?: string;
  DAILY_RELEASES_ENABLED?: string;
}

interface ReleaseNode {
  tagName: string;
  isPrerelease: boolean;
  publishedAt: string;
  name: string;
}

interface RepoResponse {
  nameWithOwner: string;
  releases: { nodes: ReleaseNode[] };
}

interface ReleaseRow {
  repo: string;
  tag: string;
  version: string;
  type: string;
  publishedAt: string;
}

export function buildReleaseBatches(
  repos: string[],
): { query: string; batchIndex: number }[] {
  const valid = repos.filter((r) => r?.includes("/"));
  if (valid.length === 0) return [];

  const batches: { query: string; batchIndex: number }[] = [];
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const slice = valid.slice(i, i + BATCH_SIZE);
    const parts = slice.map((repo, j) => {
      const [owner, name] = repo.split("/");
      return `r${j}: repository(owner: "${sanitizeGitHubName(owner)}", name: "${sanitizeGitHubName(name)}") { nameWithOwner releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { tagName isPrerelease publishedAt name } } }`;
    });
    batches.push({
      query: `{${parts.join(" ")}}`,
      batchIndex: batches.length,
    });
  }
  return batches;
}

function extractReleases(repoData: RepoResponse, cutoff: string): ReleaseRow[] {
  const results: ReleaseRow[] = [];
  for (const rel of repoData.releases.nodes) {
    if (rel.isPrerelease) continue;
    if (!rel.publishedAt || rel.publishedAt < cutoff) continue;

    const tag = rel.tagName;
    const rawVer = tag.includes("@") ? (tag.split("@").pop() ?? tag) : tag;
    const version = rawVer.replace(/^v/, "");
    const parts = version.split(".");

    let type: string | null = null;
    if (parts.length >= 3) {
      const [maj, min, pat] = parts.map((p) => parseInt(p, 10));
      if (!Number.isNaN(maj) && !Number.isNaN(min) && !Number.isNaN(pat)) {
        if (min === 0 && pat === 0) type = "major";
        else if (pat === 0) type = "minor";
      }
    } else if (parts.length === 2) {
      if (
        !Number.isNaN(parseInt(parts[0], 10)) &&
        !Number.isNaN(parseInt(parts[1], 10))
      )
        type = "minor";
    }
    if (!type) continue;

    results.push({
      repo: repoData.nameWithOwner,
      tag,
      version,
      type,
      publishedAt: rel.publishedAt.substring(0, 10),
    });
  }
  return results;
}

async function fetchBatchWithRetry(
  env: DailyReleasesEnv,
  batch: { query: string; batchIndex: number },
  cutoff: string,
): Promise<ReleaseRow[]> {
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 5/7 検証 4th: 特定 batch で fetch が hung し wall time を圧迫する疑い
    // (silent kill 再発)。 10s で abort して即 retry に流す。
    try {
      res = await fetch(GH_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "shirankedo-daily-releases/1.0",
        },
        body: JSON.stringify({ query: batch.query }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      // AbortError or network error → retry
      if (attempt < MAX_ATTEMPTS) {
        const sleepMs = Math.min(attempt * 1000, RETRY_SLEEP_CAP_MS);
        debugStage(
          env,
          `GRAPHQL_TIMEOUT_batch_${batch.batchIndex}`,
          `${String(e).substring(0, 100)} attempt=${attempt}, sleep ${sleepMs}ms`,
        );
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      throw new Error(
        `GitHub GraphQL fetch failed batch=${batch.batchIndex} (after ${attempt} attempts): ${String(e).substring(0, 200)}`,
      );
    }
    if (res.ok) break;
    // 5xx は GitHub / Cloudflare 一時的、 retry 価値あり
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      // 5/7 検証 3rd: exponential (1+4+9+16=30s) は失敗 batch が複数あると
      // sleep 累計で Worker wall time を圧迫し silent kill される。 linear に
      // 戻して累計 1+2+3+4=10s に抑える。 MAX_ATTEMPTS=5 は 504 吸収のため維持。
      const sleepMs = Math.min(attempt * 1000, RETRY_SLEEP_CAP_MS);
      debugStage(
        env,
        `GRAPHQL_RETRY_batch_${batch.batchIndex}`,
        `HTTP ${res.status} attempt=${attempt}, sleep ${sleepMs}ms`,
      );
      await new Promise((r) => setTimeout(r, sleepMs));
      continue;
    }
    const body = await res.text().catch(() => "(read fail)");
    debugStage(
      env,
      `GRAPHQL_FAIL_batch_${batch.batchIndex}`,
      `HTTP ${res.status} (attempt=${attempt}): ${body.substring(0, 300)}`,
    );
    throw new Error(
      `GitHub GraphQL HTTP ${res.status} batch=${batch.batchIndex} (after ${attempt} attempts)`,
    );
  }
  if (!res) throw new Error("unreachable");

  // 5/7 検証 7th: response body 途中切断で SyntaxError 発生 (PR #166 で観測)。
  // text() で受け取って手動 parse、 失敗時は該当 batch をスキップして全体完走させる。
  let json: {
    data?: Record<string, RepoResponse | null>;
    errors?: { message: string }[];
  };
  try {
    const text = await res.text();
    json = JSON.parse(text);
  } catch (e) {
    debugStage(
      env,
      `GRAPHQL_PARSE_FAIL_batch_${batch.batchIndex}`,
      `${String(e).substring(0, 200)} (skipping batch)`,
    );
    return [];
  }
  if (json.errors?.length) {
    debugStage(
      env,
      `GRAPHQL_PARTIAL_ERR_batch_${batch.batchIndex}`,
      json.errors
        .slice(0, 3)
        .map((e) => e.message)
        .join(" | ")
        .substring(0, 300),
    );
  }
  const releases: ReleaseRow[] = [];
  for (const repo of Object.values(json.data ?? {})) {
    if (!repo?.releases) continue;
    releases.push(...extractReleases(repo, cutoff));
  }
  return releases;
}

/**
 * GraphQL POST 前に軽量な GET /zen を 1 回叩いて egress 経路をウォームアップする。
 * 5/7 の cron context での連続 5xx 切り分け用。 失敗しても呼び出し元は本処理に
 * 進む (catch して握り潰す)。 成否を debugStage で観測性 DB に記録。
 */
async function warmUpEgress(
  env: DailyReleasesEnv,
  cronLabel: string,
): Promise<void> {
  const t0 = Date.now();
  try {
    const res = await fetch("https://api.github.com/zen", {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": `shirankedo-${cronLabel}/warmup`,
      },
    });
    debugStage(env, "WARMUP_DONE", `status=${res.status} ${Date.now() - t0}ms`);
  } catch (e) {
    debugStage(env, "WARMUP_FAIL", `${String(e)} ${Date.now() - t0}ms`);
  }
}

/**
 * 段階別 progress ログ。 PR #161 で notifyObs 経由で観測性 DB に流していたが、
 * 5/8 本番 cron 失敗の真因解析で「notifyObs 7-8 回 × n8n 遅延時の AbortSignal
 * なし fetch hung が Worker wall time を圧迫し silent kill」を特定したため、
 * console.log のみに簡略化。 完了 / 失敗 / cron failed の最終通知は別途残す。
 * cf-logs.py で過去 7 日のログ追跡可能。
 */
function debugStage(
  _env: DailyReleasesEnv,
  stage: string,
  detail?: string,
): void {
  console.log(
    JSON.stringify({
      type: "daily_releases_stage",
      stage,
      detail: detail?.substring(0, 300),
    }),
  );
}

export async function runDailyReleases(env: DailyReleasesEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_RELEASES_ENABLED !== "true";
  const db = getDb(env.DB);

  debugStage(env, "START", `dryRun=${dryRun}`);

  // 全体を try-catch で囲んで、 silent throw を捕捉して詳細通知に乗せる
  try {
    // 0. warm-up fetch: cron context での最初の egress fetch が CF proxy に弾か
    //    れる仮説の対策。 GET /zen は軽量 endpoint で、 失敗しても本処理に進む。
    await warmUpEgress(env, "daily-releases");

    // 1. tracking-repos 取得 (D1 直接)
    const trackingData = await getTrackingRepos(db);
    const repos = trackingData.map((r) => r.repo);
    debugStage(env, "GOT_TRACKING_REPOS", `${repos.length} repos`);

    console.log(
      JSON.stringify({
        type: "daily_releases_start",
        repo_count: repos.length,
        dry_run: dryRun,
      }),
    );

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const batches = buildReleaseBatches(repos);
    debugStage(env, "BUILT_BATCHES", `${batches.length} batches`);

    // 2. GraphQL バッチ取得を sequential 実行 (n8n parity)
    const allReleases: ReleaseRow[] = [];
    for (let i = 0; i < batches.length; i++) {
      const rows = await fetchBatchWithRetry(env, batches[i], cutoff);
      allReleases.push(...rows);
      if (i < batches.length - 1) {
        await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
      }
    }
    debugStage(env, "AFTER_GRAPHQL_LOOP", `${allReleases.length} releases`);
    return await finishRun(env, db, allReleases, start, dryRun);
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const stack = e instanceof Error ? (e.stack ?? "") : "";
    if (env.N8N_WEBHOOK_SECRET) {
      await notifyObs(env.N8N_WEBHOOK_SECRET, {
        severity: "warning",
        subject: "❌ shirankedo daily-releases 例外発生",
        summary: `${msg}\n${stack.substring(0, 1500)}`,
      });
    }
    throw e;
  }
}

async function finishRun(
  env: DailyReleasesEnv,
  db: ReturnType<typeof getDb>,
  allReleases: ReleaseRow[],
  start: number,
  dryRun: boolean,
): Promise<void> {
  const durationMs = Date.now() - start;
  const summary = `daily-releases${dryRun ? " (dry-run)" : ""}: ${allReleases.length}件 / ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_releases_done",
      count: allReleases.length,
      duration_ms: durationMs,
      dry_run: dryRun,
    }),
  );

  if (dryRun) return;

  // 3. INSERT (D1 直接)
  let postFailed: string | null = null;
  if (allReleases.length > 0) {
    try {
      await processReleases(db, allReleases);
    } catch (e: unknown) {
      postFailed = String(e);
      console.log(
        JSON.stringify({
          type: "daily_releases_post_failed",
          error: postFailed,
        }),
      );
    }
  }

  // 4. obs-notify + HC ping
  if (env.N8N_WEBHOOK_SECRET) {
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: postFailed ? "warning" : "info",
      subject: postFailed
        ? `❌ shirankedo daily-releases DB書込失敗 (${allReleases.length}件 / ${(durationMs / 1000).toFixed(1)}s)`
        : `✅ shirankedo daily-releases 完了 (${allReleases.length}件 / ${(durationMs / 1000).toFixed(1)}s)`,
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
