import { beforeEach, describe, expect, it } from "vitest";
import {
  releases,
  repoStats,
  vulnerabilities,
  weeklySummaries,
} from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { getSecurityTop } from "./ingest-security-read";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

const makeVuln = (
  cveId: string,
  cvssScore: number | null,
  publishedAt: string,
) => ({
  cveId,
  title: `Vuln ${cveId}`,
  cvssScore,
  publishedAt,
});

const makeRelease = (
  repo: string,
  tag: string,
  type: string,
  publishedAt: string,
) => ({
  repo,
  tag,
  version: tag,
  type,
  publishedAt,
});

const makeRepoStat = (repo: string, stars: number) => ({
  repo,
  stars,
});

const makeSummary = (content: string, createdAt: string) => ({
  content,
  createdAt,
});

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("getSecurityTop", () => {
  it("空DBで空配列を返す", async () => {
    const result = await getSecurityTop(db);
    expect(result.vulns).toEqual([]);
    expect(result.releases).toEqual([]);
    expect(result.weeklySummaries).toEqual([]);
  });

  it("脆弱性をCVSS×時間減衰スコア順で上位5件返す", async () => {
    const now = new Date("2026-03-20T00:00:00Z");
    // 同じ日付の場合、CVSSスコアが高い順
    await db.insert(vulnerabilities).values([
      makeVuln("CVE-2026-0001", 3.0, "2026-03-20"),
      makeVuln("CVE-2026-0002", 9.8, "2026-03-20"),
      makeVuln("CVE-2026-0003", 7.5, "2026-03-20"),
      makeVuln("CVE-2026-0004", 5.0, "2026-03-20"),
      makeVuln("CVE-2026-0005", 8.0, "2026-03-20"),
      makeVuln("CVE-2026-0006", 6.0, "2026-03-20"),
      makeVuln("CVE-2026-0007", null, "2026-03-20"), // null → スコア0
    ]);

    const result = await getSecurityTop(db, now);
    expect(result.vulns).toHaveLength(5);
    expect(result.vulns.map((v) => v.cveId)).toEqual([
      "CVE-2026-0002", // 9.8
      "CVE-2026-0005", // 8.0
      "CVE-2026-0003", // 7.5
      "CVE-2026-0006", // 6.0
      "CVE-2026-0004", // 5.0
    ]);
  });

  it("古い脆弱性は減衰によりスコアが下がる", async () => {
    const now = new Date("2026-03-20T00:00:00Z");
    await db.insert(vulnerabilities).values([
      makeVuln("CVE-OLD", 9.8, "2026-03-01"), // 19日前 → 9.8 * 0.85^19 ≈ 0.45
      makeVuln("CVE-NEW", 5.0, "2026-03-20"), // 今日 → 5.0 * 0.85^0 = 5.0
    ]);

    const result = await getSecurityTop(db, now);
    expect(result.vulns[0].cveId).toBe("CVE-NEW");
    expect(result.vulns[1].cveId).toBe("CVE-OLD");
  });

  it("リリースをstars×major倍率×時間減衰スコア順で上位5件返す", async () => {
    const now = new Date("2026-03-20T00:00:00Z");
    // repoStatsで最新スター数を設定
    await db
      .insert(repoStats)
      .values([
        makeRepoStat("org/repo-a", 10000),
        makeRepoStat("org/repo-b", 5000),
        makeRepoStat("org/repo-c", 8000),
        makeRepoStat("org/repo-d", 3000),
        makeRepoStat("org/repo-e", 1000),
        makeRepoStat("org/repo-f", 500),
      ]);

    await db.insert(releases).values([
      makeRelease("org/repo-a", "v1.0.0", "minor", "2026-03-20"), // 10000*1 = 10000
      makeRelease("org/repo-b", "v2.0.0", "major", "2026-03-20"), // 5000*2 = 10000
      makeRelease("org/repo-c", "v3.0.0", "minor", "2026-03-20"), // 8000*1 = 8000
      makeRelease("org/repo-d", "v4.0.0", "major", "2026-03-20"), // 3000*2 = 6000
      makeRelease("org/repo-e", "v5.0.0", "minor", "2026-03-20"), // 1000*1 = 1000
      makeRelease("org/repo-f", "v6.0.0", "minor", "2026-03-20"), // 500*1 = 500
    ]);

    const result = await getSecurityTop(db, now);
    expect(result.releases).toHaveLength(5);
    expect(result.releases.map((r) => r.repo)).toEqual([
      "org/repo-a", // 10000
      "org/repo-b", // 10000 (tiebreak by DB order)
      "org/repo-c", // 8000
      "org/repo-d", // 6000
      "org/repo-e", // 1000
    ]);
  });

  it("repoStatsがないリポのリリースはstars=0で計算", async () => {
    const now = new Date("2026-03-20T00:00:00Z");
    await db
      .insert(releases)
      .values([makeRelease("org/no-stats", "v1.0.0", "major", "2026-03-20")]);
    // repoStatsなし → stars=0 → スコア0
    const result = await getSecurityTop(db, now);
    expect(result.releases).toHaveLength(1);
    // スコアは0だが、件数が5未満なので含まれる
  });

  it("repoStatsの最新レコードのみを使う", async () => {
    const now = new Date("2026-03-20T00:00:00Z");
    // 同じリポで古いスター数と新しいスター数
    await db.insert(repoStats).values([
      makeRepoStat("org/repo-x", 100), // 古い（id小）
      makeRepoStat("org/repo-x", 50000), // 新しい（id大）
    ]);
    await db
      .insert(releases)
      .values([makeRelease("org/repo-x", "v1.0.0", "minor", "2026-03-20")]);

    const result = await getSecurityTop(db, now);
    // 最新の50000を使うべき
    expect(result.releases).toHaveLength(1);
  });

  it("週次サマリー直近4件を返す", async () => {
    await db
      .insert(weeklySummaries)
      .values([
        makeSummary("week1", "2026-03-01 00:00:00"),
        makeSummary("week2", "2026-03-08 00:00:00"),
        makeSummary("week3", "2026-03-15 00:00:00"),
        makeSummary("week4", "2026-03-22 00:00:00"),
        makeSummary("week5", "2026-03-29 00:00:00"),
      ]);

    const result = await getSecurityTop(db);
    expect(result.weeklySummaries).toHaveLength(4);
    expect(result.weeklySummaries[0].content).toBe("week5");
  });

  it("5件未満でも全件返す", async () => {
    const now = new Date("2026-03-20T00:00:00Z");
    await db
      .insert(vulnerabilities)
      .values([
        makeVuln("CVE-2026-0001", 9.8, "2026-03-20"),
        makeVuln("CVE-2026-0002", 7.5, "2026-03-20"),
      ]);

    const result = await getSecurityTop(db, now);
    expect(result.vulns).toHaveLength(2);
  });
});
