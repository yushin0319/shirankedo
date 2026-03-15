import { beforeEach, describe, expect, it } from "vitest";
import { releases, trackingRepos, vulnerabilities } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import {
  getTrackingRepos,
  processReleases,
  processTrackingRepos,
  processVulnerabilities,
} from "./ingest-upsert";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("processVulnerabilities", () => {
  const validVuln = {
    cveId: "CVE-2026-12345",
    title: "脆弱性タイトル",
    cvssScore: 9.8,
    publishedAt: "2026-03-15",
  };

  it("脆弱性を INSERT できる", async () => {
    const result = await processVulnerabilities(db, [validVuln]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    const rows = await db.select().from(vulnerabilities);
    expect(rows).toHaveLength(1);
    expect(rows[0].cvssScore).toBe(9.8);
  });

  it("既存の CVE を UPDATE できる", async () => {
    await processVulnerabilities(db, [validVuln]);
    const result = await processVulnerabilities(db, [
      { ...validVuln, cvssScore: 7.5, title: "更新タイトル" },
    ]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    const rows = await db.select().from(vulnerabilities);
    expect(rows).toHaveLength(1);
    expect(rows[0].cvssScore).toBe(7.5);
    expect(rows[0].title).toBe("更新タイトル");
  });

  it("空配列で 0/0 を返す", async () => {
    const result = await processVulnerabilities(db, []);
    expect(result).toEqual({ inserted: 0, updated: 0 });
  });
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
});

describe("processTrackingRepos", () => {
  const validRepo = {
    repo: "vercel/next.js",
    displayName: "Next.js",
    description: "Reactフレームワーク",
    language: "TypeScript",
  };

  it("リポジトリを INSERT できる", async () => {
    const result = await processTrackingRepos(db, [validRepo]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("既存リポを UPDATE できる", async () => {
    await processTrackingRepos(db, [validRepo]);
    const result = await processTrackingRepos(db, [
      { ...validRepo, description: "更新された説明" },
    ]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    const rows = await db.select().from(trackingRepos);
    expect(rows[0].description).toBe("更新された説明");
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
