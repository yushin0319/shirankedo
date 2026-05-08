import { beforeEach, describe, expect, it } from "vitest";
import { releases, repoStats, trackingRepos } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import {
  getTrackingRepos,
  processReleases,
  processRepoRenames,
  processTrackingRepos,
} from "./ingest-upsert";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("processReleases", () => {
  const validRelease = {
    repo: "facebook/react",
    tag: "v19.0.0",
    version: "19.0.0",
    type: "major" as const,
    publishedAt: "2026-03-15",
  };

  it("リリースを INSERT できる", async () => {
    const result = await processReleases(db, [validRelease]);
    expect(result.inserted).toBe(1);
  });

  it("repo+tag 重複はスキップ", async () => {
    await processReleases(db, [validRelease]);
    const result = await processReleases(db, [validRelease]);
    expect(result.inserted).toBe(0);
    const rows = await db.select().from(releases);
    expect(rows).toHaveLength(1);
  });

  it("同じリポの別タグは INSERT される", async () => {
    await processReleases(db, [validRelease]);
    const result = await processReleases(db, [
      { ...validRelease, tag: "v19.1.0", version: "19.1.0", type: "minor" },
    ]);
    expect(result.inserted).toBe(1);
    const rows = await db.select().from(releases);
    expect(rows).toHaveLength(2);
  });

  it("チャンクサイズ超過（50件）でも全件 INSERT できる", async () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({
      repo: `owner/repo-${i}`,
      tag: `v1.0.${i}`,
      version: `1.0.${i}`,
      type: "minor" as const,
      publishedAt: "2026-04-24",
    }));
    const result = await processReleases(db, batch);
    expect(result.inserted).toBe(50);
    const rows = await db.select().from(releases);
    expect(rows).toHaveLength(50);
  });
});

describe("processTrackingRepos", () => {
  const validRepo = {
    repo: "vercel/next.js",
    displayName: "Next.js",
    description: "Reactフレームワーク",
    language: "TypeScript",
    publishedAt: "2016-10-25",
  };

  it("リポジトリを INSERT できる（publishedAt含む）", async () => {
    const result = await processTrackingRepos(db, [validRepo]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    const rows = await db.select().from(trackingRepos);
    expect(rows[0].publishedAt).toBe("2016-10-25");
  });

  it("既存リポを UPDATE できる（publishedAt更新）", async () => {
    await processTrackingRepos(db, [validRepo]);
    const result = await processTrackingRepos(db, [
      {
        ...validRepo,
        description: "更新された説明",
        publishedAt: "2016-01-01",
      },
    ]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    const rows = await db.select().from(trackingRepos);
    expect(rows[0].description).toBe("更新された説明");
    expect(rows[0].publishedAt).toBe("2016-01-01");
  });
});

describe("processRepoRenames", () => {
  const oldRepo = {
    repo: "old-owner/repo",
    displayName: "Repo",
    description: "テスト",
    language: "TypeScript",
  };
  const newRepo = {
    repo: "new-owner/repo",
    displayName: "Repo",
    description: "テスト",
    language: "TypeScript",
  };

  it("from が存在 & to が存在 → from を DELETE（repo_stats も）", async () => {
    await processTrackingRepos(db, [oldRepo, newRepo]);
    await db.insert(repoStats).values([
      { repo: "old-owner/repo", stars: 100 },
      { repo: "new-owner/repo", stars: 150 },
    ]);
    const result = await processRepoRenames(db, [
      { from: "old-owner/repo", to: "new-owner/repo" },
    ]);
    expect(result).toEqual({ renamed: 0, deleted: 1 });
    const rows = await db.select().from(trackingRepos);
    expect(rows).toHaveLength(1);
    expect(rows[0].repo).toBe("new-owner/repo");
    const stats = await db.select().from(repoStats);
    expect(stats).toHaveLength(1);
    expect(stats[0].repo).toBe("new-owner/repo");
  });

  it("from が存在 & to が不在 → from を to にリネーム（repo_stats も）", async () => {
    await processTrackingRepos(db, [oldRepo]);
    await db.insert(repoStats).values([
      { repo: "old-owner/repo", stars: 100 },
      { repo: "old-owner/repo", stars: 110 },
    ]);
    const result = await processRepoRenames(db, [
      { from: "old-owner/repo", to: "new-owner/repo" },
    ]);
    expect(result).toEqual({ renamed: 1, deleted: 0 });
    const rows = await db.select().from(trackingRepos);
    expect(rows).toHaveLength(1);
    expect(rows[0].repo).toBe("new-owner/repo");
    expect(rows[0].description).toBe("テスト");
    const stats = await db.select().from(repoStats);
    expect(stats).toHaveLength(2);
    expect(stats.every((s) => s.repo === "new-owner/repo")).toBe(true);
  });

  it("from が存在しない → skip", async () => {
    await processTrackingRepos(db, [newRepo]);
    const result = await processRepoRenames(db, [
      { from: "old-owner/repo", to: "new-owner/repo" },
    ]);
    expect(result).toEqual({ renamed: 0, deleted: 0 });
    const rows = await db.select().from(trackingRepos);
    expect(rows).toHaveLength(1);
  });

  it("from も to も存在しない → skip", async () => {
    const result = await processRepoRenames(db, [
      { from: "old-owner/repo", to: "new-owner/repo" },
    ]);
    expect(result).toEqual({ renamed: 0, deleted: 0 });
    const rows = await db.select().from(trackingRepos);
    expect(rows).toHaveLength(0);
  });

  it("複数件をまとめて処理（rename + delete 混在）", async () => {
    await processTrackingRepos(db, [
      { repo: "a/old", displayName: "A", description: "a", language: "TS" },
      { repo: "b/old", displayName: "B", description: "b", language: "TS" },
      { repo: "b/new", displayName: "B", description: "b", language: "TS" },
    ]);
    const result = await processRepoRenames(db, [
      { from: "a/old", to: "a/new" },
      { from: "b/old", to: "b/new" },
    ]);
    expect(result).toEqual({ renamed: 1, deleted: 1 });
    const repos = (await db.select().from(trackingRepos))
      .map((r) => r.repo)
      .sort();
    expect(repos).toEqual(["a/new", "b/new"]);
  });

  it("空配列で renamed: 0, deleted: 0 を返す", async () => {
    const result = await processRepoRenames(db, []);
    expect(result).toEqual({ renamed: 0, deleted: 0 });
  });
});

describe("getTrackingRepos", () => {
  it("空DBで空配列を返す", async () => {
    const repos = await getTrackingRepos(db);
    expect(repos).toEqual([]);
  });

  it("追跡リポ一覧を返す", async () => {
    await db.insert(trackingRepos).values({
      repo: "vercel/next.js",
      displayName: "Next.js",
    });
    const repos = await getTrackingRepos(db);
    expect(repos).toHaveLength(1);
    expect(repos[0].repo).toBe("vercel/next.js");
  });
});
