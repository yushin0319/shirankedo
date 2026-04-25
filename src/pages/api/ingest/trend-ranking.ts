import type { APIRoute } from "astro";
import { desc, sql } from "drizzle-orm";
import { repoStats, trackingRepos } from "../../../db/schema";
import { apiGet, jsonOk } from "../../../lib/api/auth";
import { TREND_LOOKBACK_DAYS } from "../../../lib/constants";
import { queryD1 } from "../../../lib/d1-wrapper";
import { rankTrendRepos } from "../../../lib/trend";

/** トレンドランキング TOP N を返す（デフォルト10件） */
export const GET: APIRoute = apiGet(async (db, request) => {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 10, 50);

  const repos = await queryD1("tracking_repos.all", () =>
    db.select().from(trackingRepos),
  );

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - TREND_LOOKBACK_DAYS);
  const cutoff = lookback.toISOString().slice(0, 10);

  const stats = await queryD1("repo_stats.recent", () =>
    db
      .select()
      .from(repoStats)
      .where(sql`${repoStats.createdAt} >= ${cutoff}`)
      .orderBy(desc(repoStats.createdAt)),
  );

  const ranked = rankTrendRepos(repos, stats, limit);

  const data = ranked.map((r) => ({
    repo: r.repo,
    displayName: r.displayName,
    description: r.description,
    language: r.language,
    stars: r.stars,
    diff: r.diff,
  }));

  return jsonOk({ data });
});
