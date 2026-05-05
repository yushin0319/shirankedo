import { getDb } from "../../db/client";
import { getTrackingRepos, processReleases } from "../api/ingest-upsert";
import { notifyObs, pingHealthchecks, sanitizeGitHubName } from "./cron-shared";

const GH_GRAPHQL = "https://api.github.com/graphql";
const BATCH_INTERVAL_MS = 200;
const HC_SLUG = "shirankedo-daily-releases";

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

function buildReleaseBatches(
  repos: string[],
): { query: string; batchIndex: number }[] {
  const valid = repos.filter((r) => r?.includes("/"));
  if (valid.length === 0) return [];

  // 全リポを 1 GraphQL query (alias 並列) にまとめる。
  // - subrequest 1 のみ消費 (Cloudflare Workers Free Tier の 50 limit 内余裕)
  // - wall time 1-2 秒で完了 (GitHub が 1 query を server-side 並列処理)
  // - GraphQL cost = N × first:1 = N (rate limit 5000 / hour 内)
  // - request body ~150 chars/repo × 2143 = ~320KB (GitHub 1MB 限界内)
  // 旧実装は 40 件 batch × 53 batch loop で sequential + retry sleep 累積で
  // CF Workers の wall time 15min に近づき silent kill していた。
  const parts = valid.map((repo, i) => {
    const [owner, name] = repo.split("/");
    return `r${i}: repository(owner: "${sanitizeGitHubName(owner)}", name: "${sanitizeGitHubName(name)}") { nameWithOwner releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { tagName isPrerelease publishedAt name } } }`;
  });
  return [{ query: `{${parts.join(" ")}}`, batchIndex: 0 }];
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
    const allReleases: ReleaseRow[] = [];
    debugStage(env, "BUILT_BATCHES", `${batches.length} batches`);

    // 2. GraphQL バッチ取得 (5xx は retry、 4xx は即 throw)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      let res: Response | null = null;
      const MAX_ATTEMPTS = 3;
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
        // 5xx は GitHub 一時的 (Cloudflare 502 等)、 retry 価値あり
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
          debugStage(
            env,
            `GRAPHQL_RETRY_batch_${batch.batchIndex}`,
            `HTTP ${res.status} attempt=${attempt}, sleep ${attempt}s`,
          );
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }
        // 4xx か 5xx 最終失敗
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
      for (const repo of Object.values(json.data ?? {})) {
        if (!repo?.releases) continue;
        allReleases.push(...extractReleases(repo, cutoff));
      }

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
