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
  const stats = [
    { repo: "a/a", stars: 1000, createdAt: "2026-03-13" },
    { repo: "a/a", stars: 900, createdAt: "2026-03-06" },
    { repo: "b/b", stars: 500, createdAt: "2026-03-13" },
    { repo: "b/b", stars: 200, createdAt: "2026-03-06" },
    { repo: "c/c", stars: 800, createdAt: "2026-03-13" },
    { repo: "c/c", stars: 750, createdAt: "2026-03-06" },
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
    const singleStats = [{ repo: "a/a", stars: 1000, createdAt: "2026-03-13" }];
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
});
