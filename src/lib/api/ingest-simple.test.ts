import { beforeEach, describe, expect, it } from "vitest";
import { pageComments, repoStats, weeklySummaries } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import {
  processPageComments,
  processRepoStats,
  processWeeklySummary,
} from "./ingest-simple";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("processRepoStats", () => {
  it("Star スナップショットを INSERT できる", async () => {
    const result = await processRepoStats(db, [
      { repo: "vercel/next.js", stars: 130000 },
      { repo: "facebook/react", stars: 230000 },
    ]);
    expect(result.inserted).toBe(2);
    const rows = await db.select().from(repoStats);
    expect(rows).toHaveLength(2);
  });

  it("空配列で inserted: 0", async () => {
    const result = await processRepoStats(db, []);
    expect(result.inserted).toBe(0);
  });
});

describe("processWeeklySummary", () => {
  it("週次レポートを INSERT できる", async () => {
    const result = await processWeeklySummary(db, {
      content: "今週のまとめ: AI 関連の話題が多かった",
    });
    expect(result.inserted).toBe(1);
    const rows = await db.select().from(weeklySummaries);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain("今週のまとめ");
  });
});

describe("processPageComments", () => {
  it("ページコメントを INSERT できる", async () => {
    const result = await processPageComments(db, [
      { type: "trend", content: "今週のトレンド総評" },
      { type: "ai_api", content: "API比較コメント" },
      { type: "ai_sub", content: "サブスク比較コメント" },
    ]);
    expect(result.inserted).toBe(3);
    const rows = await db.select().from(pageComments);
    expect(rows).toHaveLength(3);
  });

  it("不正な type でエラー", async () => {
    await expect(
      processPageComments(db, [{ type: "invalid", content: "test" }]),
    ).rejects.toThrow();
  });

  it("空配列で inserted: 0", async () => {
    const result = await processPageComments(db, []);
    expect(result.inserted).toBe(0);
  });
});
