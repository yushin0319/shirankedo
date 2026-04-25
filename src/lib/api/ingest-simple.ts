// シンプル INSERT 系のロジック（repo-stats, weekly-summaries, page-comments, security-daily）

import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import {
  pageComments,
  repoStats,
  securityDaily,
  weeklySummaries,
} from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import {
  pageCommentSchema,
  repoStatSchema,
  securityDailySchema,
  weeklySummarySchema,
} from "./schemas";

/** repo-stats: Star 週次スナップショット INSERT */
export async function processRepoStats(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number }> {
  if (data.length === 0) return { inserted: 0 };
  const parsed = z.array(repoStatSchema).parse(data);
  for (const item of parsed) {
    await queryD1("repo_stats.insert", () => db.insert(repoStats).values(item));
  }
  return { inserted: parsed.length };
}

/** weekly-summaries: 週次レポート INSERT */
export async function processWeeklySummary(
  db: AppDatabase,
  data: unknown,
): Promise<{ inserted: number }> {
  const parsed = weeklySummarySchema.parse(data);
  await queryD1("weekly_summaries.insert", () =>
    db.insert(weeklySummaries).values(parsed),
  );
  return { inserted: 1 };
}

/** page-comments: ページ付箋コメント INSERT */
export async function processPageComments(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number }> {
  if (data.length === 0) return { inserted: 0 };
  const parsed = z.array(pageCommentSchema).parse(data);
  for (const item of parsed) {
    await queryD1("page_comments.insert", () =>
      db.insert(pageComments).values(item),
    );
  }
  return { inserted: parsed.length };
}

/** security-daily: セキュリティ日次サマリー INSERT */
export async function processSecurityDaily(
  db: AppDatabase,
  data: unknown,
): Promise<{ inserted: number }> {
  const parsed = securityDailySchema.parse(data);
  await queryD1("security_daily.insert", () =>
    db.insert(securityDaily).values(parsed),
  );
  return { inserted: 1 };
}
