// セキュリティTop情報の読み出しロジック（GET用）
// security.astro と同じスコアリングロジックでTop5を返す

import { desc, sql } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import {
  releases,
  repoStats,
  vulnerabilities,
  weeklySummaries,
} from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { releaseDecayScore, vulnDecayScore } from "../score";
import type { getRecentWeeklySummaries } from "./ingest-weekly-read";

type VulnRow = typeof vulnerabilities.$inferSelect;
type ReleaseRow = typeof releases.$inferSelect;
type SummaryRow = Awaited<ReturnType<typeof getRecentWeeklySummaries>>[number];

export interface SecurityTopData {
  vulns: VulnRow[];
  releases: ReleaseRow[];
  weeklySummaries: SummaryRow[];
}

/** セキュリティページ用Top5データを取得（脆弱性・リリース・週次サマリー）。
 * 4 つの D1 select を db.batch() で 1 subrequest に集約し、cron 並列時の
 * Cloudflare Workers subrequest 50 limit を回避する。 */
export async function getSecurityTop(
  db: AppDatabase,
  now: Date = new Date(),
): Promise<SecurityTopData> {
  type BatchInput = Parameters<typeof db.batch>[0];
  const stmts = [
    db.select().from(vulnerabilities),
    db
      .select({ repo: repoStats.repo, stars: repoStats.stars })
      .from(repoStats)
      .where(
        sql`${repoStats.id} IN (SELECT MAX(id) FROM repo_stats GROUP BY repo)`,
      ),
    db.select().from(releases),
    db
      .select()
      .from(weeklySummaries)
      .orderBy(desc(weeklySummaries.createdAt))
      .limit(4),
  ] as unknown as BatchInput;
  const [vulnsRaw, latestStats, relsRaw, summaries] = (await queryD1(
    "security_top.batch",
    () => db.batch(stmts),
  )) as unknown as [
    VulnRow[],
    { repo: string; stars: number }[],
    ReleaseRow[],
    SummaryRow[],
  ];

  const topVulns = vulnsRaw
    .sort(
      (a, b) =>
        vulnDecayScore(b.cvssScore, b.publishedAt, now) -
        vulnDecayScore(a.cvssScore, a.publishedAt, now),
    )
    .slice(0, 5);

  const starsMap: Record<string, number> = Object.fromEntries(
    latestStats.map((s) => [s.repo, s.stars]),
  );
  const topReleases = relsRaw
    .sort(
      (a, b) =>
        releaseDecayScore(starsMap[b.repo] ?? 0, b.type, b.publishedAt, now) -
        releaseDecayScore(starsMap[a.repo] ?? 0, a.type, a.publishedAt, now),
    )
    .slice(0, 5);

  return {
    vulns: topVulns,
    releases: topReleases,
    weeklySummaries: summaries,
  };
}
