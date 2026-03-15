import { beforeEach, describe, expect, it } from "vitest";
import { articles } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { getArticleUrls, getRecentArticles } from "./ingest-articles-read";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

const makeArticle = (url: string, publishedAt: string) => ({
  url,
  title: `記事: ${url}`,
  source: "hackernews",
  summary: "要約",
  comment: "コメ",
  tags: '["AI"]',
  impact: 5,
  publishedAt,
});

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("getArticleUrls", () => {
  it("空DBで空配列を返す", async () => {
    const urls = await getArticleUrls(db);
    expect(urls).toEqual([]);
  });

  it("既存URLの一覧を返す", async () => {
    await db
      .insert(articles)
      .values([
        makeArticle("https://example.com/1", "2026-03-15"),
        makeArticle("https://example.com/2", "2026-03-14"),
      ]);
    const urls = await getArticleUrls(db);
    expect(urls).toHaveLength(2);
    expect(urls).toContain("https://example.com/1");
    expect(urls).toContain("https://example.com/2");
  });
});

describe("getRecentArticles", () => {
  it("直近7日分の記事を返す", async () => {
    const today = new Date().toISOString().split("T")[0];
    const oldDate = "2020-01-01";
    await db
      .insert(articles)
      .values([
        makeArticle("https://example.com/recent", today),
        makeArticle("https://example.com/old", oldDate),
      ]);
    const recent = await getRecentArticles(db, 7);
    expect(recent).toHaveLength(1);
    expect(recent[0].url).toBe("https://example.com/recent");
  });

  it("publishedAt 降順でソートされる", async () => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];
    await db
      .insert(articles)
      .values([
        makeArticle("https://example.com/yesterday", yesterday),
        makeArticle("https://example.com/today", today),
      ]);
    const recent = await getRecentArticles(db, 7);
    expect(recent[0].url).toBe("https://example.com/today");
    expect(recent[1].url).toBe("https://example.com/yesterday");
  });
});
