import { describe, expect, it } from "vitest";
import { buildStarBatches } from "./build-star-batches";

describe("buildStarBatches", () => {
  it("空配列で空バッチを返す", () => {
    expect(buildStarBatches([])).toEqual([]);
  });

  it("100件以下なら 1 バッチ", () => {
    const repos = Array.from({ length: 30 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
    }));
    const batches = buildStarBatches(repos);
    expect(batches).toHaveLength(1);
    expect(Object.keys(batches[0].repoMap)).toHaveLength(30);
    expect(batches[0].batchIndex).toBe(0);
    // GraphQL クエリに alias r0..r29 が含まれる
    expect(batches[0].query).toMatch(/r0: repository\(owner: "owner0"/);
    expect(batches[0].query).toMatch(/r29: repository\(owner: "owner29"/);
  });

  it("101件で 2 バッチ（100 + 1）", () => {
    const repos = Array.from({ length: 101 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
    }));
    const batches = buildStarBatches(repos);
    expect(batches).toHaveLength(2);
    expect(Object.keys(batches[0].repoMap)).toHaveLength(100);
    expect(Object.keys(batches[1].repoMap)).toHaveLength(1);
    expect(batches[1].batchIndex).toBe(1);
    // 2 バッチ目のエイリアスは r100（連番継続）
    expect(batches[1].query).toMatch(/r100: repository/);
    expect(batches[1].repoMap.r100).toBe("owner100/repo100");
  });

  it("不正な文字を含む owner/name はサニタイズされる", () => {
    const batches = buildStarBatches([{ repo: 'a"b/c}d' }]);
    // " と } は除去される
    expect(batches[0].query).toMatch(/owner: "ab", name: "cd"/);
    // repoMap には元の repo 名が保存される
    expect(batches[0].repoMap.r0).toBe('a"b/c}d');
  });
});
