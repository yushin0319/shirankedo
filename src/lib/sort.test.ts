import { describe, expect, it } from "vitest";
import {
  getDefaultDir,
  getProviderGapIndices,
  nextSortState,
  sortByKey,
} from "./sort";

// テスト用データ
const apiItems = [
  { provider: "OpenAI", score: 45, monthly: 500, price: 0 },
  { provider: "Anthropic", score: 50, monthly: 800, price: 0 },
  { provider: "Google", score: 40, monthly: 300, price: 0 },
  { provider: "OpenAI", score: 35, monthly: 200, price: 0 },
  { provider: "Anthropic", score: 42, monthly: 600, price: 0 },
];

const subItems = [
  { provider: "OpenAI", score: 0, monthly: 0, price: 2000 },
  { provider: "Anthropic", score: 0, monthly: 0, price: 3000 },
  { provider: "OpenAI", score: 0, monthly: 0, price: 0 },
  { provider: "Google", score: 0, monthly: 0, price: 1500 },
];

describe("sortByKey", () => {
  it("score desc: スコア降順", () => {
    const result = sortByKey(apiItems, "score", "desc");
    const scores = result.map((r) => r.score);
    expect(scores).toEqual([50, 45, 42, 40, 35]);
  });

  it("score asc: スコア昇順", () => {
    const result = sortByKey(apiItems, "score", "asc");
    const scores = result.map((r) => r.score);
    expect(scores).toEqual([35, 40, 42, 45, 50]);
  });

  it("provider asc: プロバイダー名順、同プロバイダー内はスコア降順", () => {
    const result = sortByKey(apiItems, "provider", "asc");
    expect(result.map((r) => `${r.provider}:${r.score}`)).toEqual([
      "Anthropic:50",
      "Anthropic:42",
      "Google:40",
      "OpenAI:45",
      "OpenAI:35",
    ]);
  });

  it("provider desc: プロバイダー名逆順、同プロバイダー内はスコア降順", () => {
    const result = sortByKey(apiItems, "provider", "desc");
    expect(result[0].provider).toBe("OpenAI");
    expect(result[result.length - 1].provider).toBe("Anthropic");
  });

  it("monthly asc: 月額昇順", () => {
    const result = sortByKey(apiItems, "monthly", "asc");
    const monthlies = result.map((r) => r.monthly);
    expect(monthlies).toEqual([200, 300, 500, 600, 800]);
  });

  it("monthly desc: 月額降順", () => {
    const result = sortByKey(apiItems, "monthly", "desc");
    const monthlies = result.map((r) => r.monthly);
    expect(monthlies).toEqual([800, 600, 500, 300, 200]);
  });

  it("price asc: 価格昇順", () => {
    const result = sortByKey(subItems, "price", "asc");
    const prices = result.map((r) => r.price);
    expect(prices).toEqual([0, 1500, 2000, 3000]);
  });

  it("price desc: 価格降順", () => {
    const result = sortByKey(subItems, "price", "desc");
    const prices = result.map((r) => r.price);
    expect(prices).toEqual([3000, 2000, 1500, 0]);
  });

  it("元の配列を変更しない", () => {
    const original = [...apiItems];
    sortByKey(apiItems, "score", "asc");
    expect(apiItems).toEqual(original);
  });
});

describe("getProviderGapIndices", () => {
  it("プロバイダー境界のインデックスを返す", () => {
    const sorted = sortByKey(apiItems, "provider", "asc");
    // Anthropic(0,1), Google(2), OpenAI(3,4) → gap at 2, 3
    const gaps = getProviderGapIndices(sorted);
    expect(gaps).toEqual(new Set([2, 3]));
  });

  it("単一プロバイダー → 空Set", () => {
    const items = [
      { provider: "OpenAI", score: 50, monthly: 500, price: 0 },
      { provider: "OpenAI", score: 40, monthly: 300, price: 0 },
    ];
    expect(getProviderGapIndices(items)).toEqual(new Set());
  });

  it("空配列 → 空Set", () => {
    expect(getProviderGapIndices([])).toEqual(new Set());
  });
});

describe("getDefaultDir", () => {
  it("provider → asc", () => {
    expect(getDefaultDir("provider")).toBe("asc");
  });

  it("score → desc", () => {
    expect(getDefaultDir("score")).toBe("desc");
  });

  it("monthly → desc", () => {
    expect(getDefaultDir("monthly")).toBe("desc");
  });

  it("price → desc", () => {
    expect(getDefaultDir("price")).toBe("desc");
  });
});

describe("nextSortState", () => {
  it("同じキー → 方向反転", () => {
    const result = nextSortState({ key: "score", dir: "desc" }, "score");
    expect(result).toEqual({ key: "score", dir: "asc" });
  });

  it("新しいキー → デフォルト方向", () => {
    const result = nextSortState({ key: "score", dir: "desc" }, "provider");
    expect(result).toEqual({ key: "provider", dir: "asc" });
  });

  it("新しいキー monthly → desc", () => {
    const result = nextSortState({ key: "provider", dir: "asc" }, "monthly");
    expect(result).toEqual({ key: "monthly", dir: "desc" });
  });
});
