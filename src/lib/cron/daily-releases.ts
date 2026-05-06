import { getDb } from "../../db/client";
import { getTrackingRepos, processReleases } from "../api/ingest-upsert";
import { notifyObs, pingHealthchecks, sanitizeGitHubName } from "./cron-shared";

const GH_GRAPHQL = "https://api.github.com/graphql";
const HC_SLUG = "shirankedo-daily-releases";
// 検証履歴:
// - PR #153 (1 query × 2143 alias): GitHub HTTP 500 (body 過大)
// - PR #154 (Promise.all × 6 batch × 400 alias): 全 batch HTTP 502 "error code: 502"
//   → CF Workers から api.github.com/graphql への並列 fetch を CF egress proxy が弾く
// 結論: n8n parity の sequential が最も確実。 100/batch × 22 batch sequential。
// - subreq 22 + obs/hc = ~25 (Free Tier 50 limit 内)
// - wall time 約 1.5s × 22 = ~33s (CPU 15min 上限内余裕)
const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 200;
const MAX_ATTEMPTS = 3;

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
    res = await fetch(GH_GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "shirankedo-daily-releases/1.0",
      },
      body: JSON.stringify({ query: batch.query }),
    });
    if (res.ok) break;
    // 5xx は GitHub / Cloudflare 一時的、 retry 価値あり
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      debugStage(
        env,
        `GRAPHQL_RETRY_batch_${batch.batchIndex}`,
        `HTTP ${res.status} attempt=${attempt}, sleep ${attempt}s`,
      );
      await new Promise((r) => setTimeout(r, attempt * 1000));
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

  const json = (await res.json()) as {
    data?: Record<string, RepoResponse | null>;
    errors?: { message: string }[];
  };
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

// [DIAGNOSTICS] 真因切り分け用の段階別 fire-and-forget 通知。特定後に削除。
function debugStage(
  env: DailyReleasesEnv,
  stage: string,
  detail?: string,
): void {
  if (!env.N8N_WEBHOOK_SECRET) return;
  notifyObs(env.N8N_WEBHOOK_SECRET, {
    severity: "info",
    subject: `🟡 daily-releases ${stage}`,
    summary: detail ?? "",
  }).catch(() => {});
}

export async function runDailyReleases(env: DailyReleasesEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_RELEASES_ENABLED !== "true";
  const db = getDb(env.DB);

  debugStage(env, "START", `dryRun=${dryRun}`);

  // 全体を try-catch で囲んで、 silent throw を捕捉して詳細通知に乗せる
  try {
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
