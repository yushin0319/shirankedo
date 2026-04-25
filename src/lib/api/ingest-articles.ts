// 記事 INSERT ロジック
import { inArray } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { articles } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { dailyArticlesSchema } from "./schemas";

/** 記事を INSERT（重複URL はスキップ） */
export async function processArticles(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number }> {
  if (data.length === 0) return { inserted: 0 };

  const parsed = dailyArticlesSchema.parse(data);

  // 既存URLを取得して重複を除外
  const urls = parsed.map((a) => a.url);
  const existing = await queryD1("articles.existing_urls", () =>
    db
      .select({ url: articles.url })
      .from(articles)
      .where(inArray(articles.url, urls)),
  );
  const existingUrls = new Set(existing.map((r) => r.url));
  const newItems = parsed.filter((a) => !existingUrls.has(a.url));

  if (newItems.length === 0) return { inserted: 0 };

  for (const item of newItems) {
    await queryD1("articles.insert", () => db.insert(articles).values(item));
  }
  return { inserted: newItems.length };
}
