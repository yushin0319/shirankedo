import { beforeEach, describe, expect, it } from "vitest";
import { weeklySummaries } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { getRecentWeeklySummaries } from "./ingest-weekly-read";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

const makeSummary = (content: string, createdAt: string) => ({
  content,
  createdAt,
});

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("getRecentWeeklySummaries", () => {
  it("空DBで空配列を返す", async () => {
    const result = await getRecentWeeklySummaries(db);
    expect(result).toEqual([]);
  });

  it("デフォルトで直近4件を返す", async () => {
    await db
      .insert(weeklySummaries)
      .values([
        makeSummary("week1", "2026-03-01 00:00:00"),
        makeSummary("week2", "2026-03-08 00:00:00"),
        makeSummary("week3", "2026-03-15 00:00:00"),
        makeSummary("week4", "2026-03-22 00:00:00"),
        makeSummary("week5", "2026-03-29 00:00:00"),
      ]);
    const result = await getRecentWeeklySummaries(db);
    expect(result).toHaveLength(4);
    expect(result[0].content).toBe("week5");
    expect(result[3].content).toBe("week2");
  });

  it("件数を指定できる", async () => {
    await db
      .insert(weeklySummaries)
      .values([
        makeSummary("w1", "2026-03-01 00:00:00"),
        makeSummary("w2", "2026-03-08 00:00:00"),
        makeSummary("w3", "2026-03-15 00:00:00"),
      ]);
    const result = await getRecentWeeklySummaries(db, 2);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("w3");
    expect(result[1].content).toBe("w2");
  });
});
