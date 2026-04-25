// セキュリティTop情報の読み出しロジック（GET用）
// security.astro と同じスコアリングロジックでTop5を返す

import { sql } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { releases, repoStats, vulnerabilities } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { releaseDecayScore, vulnDecayScore } from "../score";
import { getRecentWeeklySummaries } from "./ingest-weekly-read";

type VulnRow = typeof vulnerabilities.$inferSelect;
type ReleaseRow = typeof releases.$inferSelect;
type SummaryRow = Awaited<ReturnType<typeof getRecentWeeklySummaries>>[number];

export interface SecurityTopData {
  vulns: VulnRow[];
  releases: ReleaseRow[];
  weeklySummaries: SummaryRow[];
}

/** セキュリティページ用Top5データを取得（脆弱性・リリース・週次サマリー） */
export async function getSecurityTop(
  db: AppDatabase,
  now: Date = new Date(),
): Promise<SecurityTopData> {
  // 脆弱性: 全件取得 → decay score順ソート → Top 5
  const vulnsRaw = await queryD1("vulnerabilities.all", () =>
    db.select().from(vulnerabilities),
  );
  const topVulns = vulnsRaw
    .sort(
      (a, b) =>
        vulnDecayScore(b.cvssScore, b.publishedAt, now) -
        vulnDecayScore(a.cvssScore, a.publishedAt, now),
    )
    .slice(0, 5);

  // repoStats: 各リポの最新スター数を取得
  const latestStats = await queryD1("repo_stats.latest", () =>
    db
      .select({ repo: repoStats.repo, stars: repoStats.stars })
      .from(repoStats)
      .where(
        sql`${repoStats.id} IN (SELECT MAX(id) FROM repo_stats GROUP BY repo)`,
      ),
  );
  const starsMap: Record<string, number> = Object.fromEntries(
    latestStats.map((s) => [s.repo, s.stars]),
  );

  // リリース: 全件取得 → decay score順ソート → Top 5
  const relsRaw = await queryD1("releases.all", () =>
    db.select().from(releases),
  );
  const topReleases = relsRaw
    .sort(
      (a, b) =>
        releaseDecayScore(starsMap[b.repo] ?? 0, b.type, b.publishedAt, now) -
        releaseDecayScore(starsMap[a.repo] ?? 0, a.type, a.publishedAt, now),
    )
    .slice(0, 5);

  // 週次サマリー: 直近4件
  const summaries = await getRecentWeeklySummaries(db, 4);

  return {
    vulns: topVulns,
    releases: topReleases,
    weeklySummaries: summaries,
  };
}
