import { beforeEach, describe, expect, it } from "vitest";
import { articles } from "../../../db/schema";
import { createTestDbWithTables } from "../../../db/test-helper";
import { processArticles } from "../../../lib/api/ingest-articles";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

const validArticle = {
  url: "https://example.com/1",
  title: "テスト記事",
  source: "hackernews",
  summary: "要約テスト",
  comment: "コメントテスト",
  tags: ["AI", "Rust"],
  impact: 8,
  publishedAt: "2026-03-15",
};

describe("processArticles", () => {
  it("記事を INSERT できる", async () => {
    const result = await processArticles(db, [validArticle]);
    expect(result.inserted).toBe(1);

    const rows = await db.select().from(articles);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("テスト記事");
    expect(rows[0].tags).toBe('["AI","Rust"]');
    expect(rows[0].isPaper).toBe(0);
  });

  it("複数記事を INSERT できる", async () => {
    const items = [
      validArticle,
      { ...validArticle, url: "https://example.com/2", title: "記事2" },
      { ...validArticle, url: "https://example.com/3", title: "記事3" },
    ];
    const result = await processArticles(db, items);
    expect(result.inserted).toBe(3);

    const rows = await db.select().from(articles);
    expect(rows).toHaveLength(3);
  });

  it("重複URL はスキップされる", async () => {
    await processArticles(db, [validArticle]);
    const result = await processArticles(db, [validArticle]);
    expect(result.inserted).toBe(0);

    const rows = await db.select().from(articles);
    expect(rows).toHaveLength(1);
  });

  it("isPaper を 1 に設定できる", async () => {
    const paper = { ...validArticle, isPaper: 1 };
    await processArticles(db, [paper]);

    const rows = await db.select().from(articles);
    expect(rows[0].isPaper).toBe(1);
  });

  it("空配列で inserted: 0 を返す", async () => {
    const result = await processArticles(db, []);
    expect(result.inserted).toBe(0);
  });
});
