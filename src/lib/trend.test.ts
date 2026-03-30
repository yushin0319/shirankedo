import { describe, expect, it } from "vitest";
import { isNewRepo, rankTrendRepos } from "./trend";

describe("isNewRepo", () => {
  it("published_at が7日以内の場合、trueを返す", () => {
    const now = new Date("2026-03-13");
    expect(isNewRepo("2026-03-10", now)).toBe(true);
    expect(isNewRepo("2026-03-07", now)).toBe(true); // ちょうど6日前
  });

  it("published_at が7日より前の場合、falseを返す", () => {
    const now = new Date("2026-03-13");
    expect(isNewRepo("2026-03-05", now)).toBe(false); // 8日前
    expect(isNewRepo("2026-01-01", now)).toBe(false);
  });

  it("published_at が null/undefined の場合、falseを返す", () => {
    const now = new Date("2026-03-13");
    expect(isNewRepo(null, now)).toBe(false);
    expect(isNewRepo(undefined, now)).toBe(false);
  });
});

describe("rankTrendRepos", () => {
  const repos = [
    {
      repo: "a/a",
      displayName: "A",
      description: null,
      language: null,
      publishedAt: "2026-03-01",
    },
    {
      repo: "b/b",
      displayName: "B",
      description: null,
      language: null,
      publishedAt: "2026-03-01",
    },
    {
      repo: "c/c",
      displayName: "C",
      description: null,
      language: null,
      publishedAt: "2026-03-01",
    },
  ];

  // 最新日のstarsが先、古い日のstarsが後に来る想定（createdAt降順）
  // 7日差（168時間）→ 173時間以内なので前回分として採用される
  const stats = [
    { repo: "a/a", stars: 1000, createdAt: "2026-03-13T03:00:00" },
    { repo: "a/a", stars: 900, createdAt: "2026-03-06T03:00:00" },
    { repo: "b/b", stars: 500, createdAt: "2026-03-13T03:00:00" },
    { repo: "b/b", stars: 200, createdAt: "2026-03-06T03:00:00" },
    { repo: "c/c", stars: 800, createdAt: "2026-03-13T03:00:00" },
    { repo: "c/c", stars: 750, createdAt: "2026-03-06T03:00:00" },
  ];

  it("diff降順でソートし、limitで切る", () => {
    const result = rankTrendRepos(repos, stats, 2);
    expect(result).toHaveLength(2);
    // b/b: +300, a/a: +100, c/c: +50
    expect(result[0].repo).toBe("b/b");
    expect(result[0].diff).toBe(300);
    expect(result[1].repo).toBe("a/a");
    expect(result[1].diff).toBe(100);
  });

  it("statsが1件のみのリポはdiff=0", () => {
    const singleStats = [
      { repo: "a/a", stars: 1000, createdAt: "2026-03-13T03:00:00" },
    ];
    const result = rankTrendRepos(repos, singleStats, 50);
    const repoA = result.find((r) => r.repo === "a/a");
    expect(repoA?.diff).toBe(0);
    expect(repoA?.stars).toBe(1000);
  });

  it("リポ数がlimit未満の場合、全件返る", () => {
    const result = rankTrendRepos(repos, stats, 50);
    expect(result).toHaveLength(3);
  });

  it("starsフィールドが正しく設定される", () => {
    const result = rankTrendRepos(repos, stats, 50);
    const repoA = result.find((r) => r.repo === "a/a");
    expect(repoA?.stars).toBe(1000); // 最新のstars
  });

  it("173時間を超えた古いスナップショットは無視される", () => {
    // 最新: 3/13T03:00、古い方: 3/5T00:00 = 195時間差 → 173時間超
    const statsOutOfWindow = [
      { repo: "a/a", stars: 1000, createdAt: "2026-03-13T03:00:00" },
      { repo: "a/a", stars: 500, createdAt: "2026-03-05T00:00:00" },
    ];
    const result = rankTrendRepos(repos, statsOutOfWindow, 50);
    const repoA = result.find((r) => r.repo === "a/a");
    expect(repoA?.diff).toBe(0); // 窓外なので無視、diff=0
  });

  it("173時間以内に複数スナップショットがある場合、最古を前回分として採用", () => {
    // 最新: 3/13T03:00
    // 中間: 3/10T03:00 (72時間差)
    // 最古: 3/07T03:00 (144時間差) → 173時間以内で最古 → これを採用
    const multiStats = [
      { repo: "a/a", stars: 1000, createdAt: "2026-03-13T03:00:00" },
      { repo: "a/a", stars: 800, createdAt: "2026-03-10T03:00:00" },
      { repo: "a/a", stars: 600, createdAt: "2026-03-07T03:00:00" },
    ];
    const result = rankTrendRepos(repos, multiStats, 50);
    const repoA = result.find((r) => r.repo === "a/a");
    expect(repoA?.diff).toBe(400); // 1000 - 600
  });

  it("173時間ちょうどの境界値はウィンドウ内として扱う", () => {
    // 最新: 3/13T03:00:00
    // 古い方: 3/06T02:00:00 = ちょうど169時間差 → 173時間以内
    const boundaryStats = [
      { repo: "a/a", stars: 1000, createdAt: "2026-03-13T03:00:00" },
      { repo: "a/a", stars: 700, createdAt: "2026-03-06T02:00:00" },
    ];
    const result = rankTrendRepos(repos, boundaryStats, 50);
    const repoA = result.find((r) => r.repo === "a/a");
    expect(repoA?.diff).toBe(300); // 窓内なので採用
  });

  it("新規リポ: 3日分のデータでもdiffが出る", () => {
    // 最新: 3/13T03:00、3日前: 3/10T03:00 → 72時間差 → 173時間以内
    const newRepoStats = [
      { repo: "a/a", stars: 5000, createdAt: "2026-03-13T03:00:00" },
      { repo: "a/a", stars: 2000, createdAt: "2026-03-10T03:00:00" },
    ];
    const result = rankTrendRepos(repos, newRepoStats, 50);
    const repoA = result.find((r) => r.repo === "a/a");
    expect(repoA?.diff).toBe(3000);
  });
});
