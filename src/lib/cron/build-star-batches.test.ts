import { describe, expect, it } from "vitest";
import { buildStarBatches } from "./build-star-batches";

describe("buildStarBatches", () => {
  it("空配列で空バッチを返す", () => {
    expect(buildStarBatches([])).toEqual([]);
  });

  it("150件以下なら 1 バッチ", () => {
    const repos = Array.from({ length: 150 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
    }));
    const batches = buildStarBatches(repos);
    expect(batches).toHaveLength(1);
    expect(Object.keys(batches[0].repoMap)).toHaveLength(150);
    expect(batches[0].batchIndex).toBe(0);
    // GraphQL クエリに alias r0..r149 が含まれる
    expect(batches[0].query).toMatch(/r0: repository\(owner: "owner0"/);
    expect(batches[0].query).toMatch(/r149: repository\(owner: "owner149"/);
  });

  it("151件で 2 バッチ（150 + 1）", () => {
    const repos = Array.from({ length: 151 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
    }));
    const batches = buildStarBatches(repos);
    expect(batches).toHaveLength(2);
    expect(Object.keys(batches[0].repoMap)).toHaveLength(150);
    expect(Object.keys(batches[1].repoMap)).toHaveLength(1);
    expect(batches[1].batchIndex).toBe(1);
    // 2 バッチ目のエイリアスは r150（連番継続）
    expect(batches[1].query).toMatch(/r150: repository/);
    expect(batches[1].repoMap.r150).toBe("owner150/repo150");
  });

  it("追跡 4,600 件でも GraphQL は 31 回に収まる（Workers の subrequest 50 回の枠を残す）", () => {
    const repos = Array.from({ length: 4600 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
    }));
    expect(buildStarBatches(repos)).toHaveLength(31);
  });

  it("不正な文字を含む owner/name はサニタイズされる", () => {
    const batches = buildStarBatches([{ repo: 'a"b/c}d' }]);
    // " と } は除去される
    expect(batches[0].query).toMatch(/owner: "ab", name: "cd"/);
    // repoMap には元の repo 名が保存される
    expect(batches[0].repoMap.r0).toBe('a"b/c}d');
  });
});
