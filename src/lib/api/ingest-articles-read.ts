// 記事読み出しロジック（GET用）
import { desc, gte } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { articles } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";

/** 既存URL一覧を取得 */
export async function getArticleUrls(db: AppDatabase): Promise<string[]> {
  const rows = await queryD1("articles.urls", () =>
    db.select({ url: articles.url }).from(articles),
  );
  return rows.map((r) => r.url);
}

/** 直近N日分の記事を取得 */
export async function getRecentArticles(
  db: AppDatabase,
  days = 7,
): Promise<(typeof articles.$inferSelect)[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  return queryD1("articles.recent", () =>
    db
      .select()
      .from(articles)
      .where(gte(articles.publishedAt, sinceStr))
      .orderBy(desc(articles.publishedAt)),
  );
}
