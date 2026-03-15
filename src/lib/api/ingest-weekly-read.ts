// 週次サマリー読み出しロジック（GET用）
import { desc } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { weeklySummaries } from "../../db/schema";

/** 直近N件の週次サマリーを取得（新しい順） */
export async function getRecentWeeklySummaries(
  db: AppDatabase,
  limit = 4,
): Promise<(typeof weeklySummaries.$inferSelect)[]> {
  return db
    .select()
    .from(weeklySummaries)
    .orderBy(desc(weeklySummaries.createdAt))
    .limit(limit);
}
