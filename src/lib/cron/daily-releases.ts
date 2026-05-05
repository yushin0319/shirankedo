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

  const BATCH_SIZE = 40;
  const batches = [];
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const parts = batch.map((repo, idx) => {
      const [owner, name] = repo.split("/");
      const alias = `r${batchIndex}_${idx}`;
      return `${alias}: repository(owner: "${sanitizeGitHubName(owner)}", name: "${sanitizeGitHubName(name)}") { nameWithOwner releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { tagName isPrerelease publishedAt name } } }`;
    });
    batches.push({ query: `{${parts.join(" ")}}`, batchIndex });
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

export async function runDailyReleases(env: DailyReleasesEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_RELEASES_ENABLED !== "true";
  const db = getDb(env.DB);

  // 1. tracking-repos 取得 (D1 直接)
  const trackingData = await getTrackingRepos(db);
  const repos = trackingData.map((r) => r.repo);

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

  // 2. GraphQL バッチ取得
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const res = await fetch(GH_GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "shirankedo-daily-releases/1.0",
      },
      body: JSON.stringify({ query: batch.query }),
    });
    if (!res.ok)
      throw new Error(
        `GitHub GraphQL HTTP ${res.status} batch=${batch.batchIndex}`,
      );

    const json = (await res.json()) as {
      data?: Record<string, RepoResponse | null>;
    };
    for (const repo of Object.values(json.data ?? {})) {
      if (!repo?.releases) continue;
      allReleases.push(...extractReleases(repo, cutoff));
    }

    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
    }
  }

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
