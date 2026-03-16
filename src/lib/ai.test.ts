import { describe, expect, it } from "vitest";
import { estimateMonthly, parseModels } from "./ai";

describe("parseModels", () => {
  it("有効なJSON配列をパースしてstring[]を返す", () => {
    expect(parseModels('["GPT-4o","o4-mini"]')).toEqual(["GPT-4o", "o4-mini"]);
  });

  it("空配列のJSONは空配列を返す", () => {
    expect(parseModels("[]")).toEqual([]);
  });

  it("不正なJSONは空配列を返す", () => {
    expect(parseModels("invalid json")).toEqual([]);
  });

  it("配列でないJSONは空配列を返す", () => {
    expect(parseModels('{"key":"value"}')).toEqual([]);
  });

  it("空文字列は空配列を返す", () => {
    expect(parseModels("")).toEqual([]);
  });
});

describe("estimateMonthly", () => {
  // シナリオ: input 1,200tok + output 200tok × 3,000 req/mo
  // = input 3.6M tok + output 0.6M tok
  // usd = inputPrice * 3.6 + outputPrice * 0.6

  it("USD価格をデフォルトレート(150)で円換算する", () => {
    // usd = 2.5*3.6 + 10*0.6 = 15 → jpy = 15*150 = 2250
    expect(estimateMonthly(2.5, 10, "USD")).toBe("¥2,250");
  });

  it("USD価格を指定レートで円換算する", () => {
    // usd = 2.5*3.6 + 10*0.6 = 15 → jpy = 15*155 = 2325
    expect(estimateMonthly(2.5, 10, "USD", 155)).toBe("¥2,325");
  });

  it("JPY価格はレート指定があっても為替換算しない", () => {
    // usd = 500*3.6 + 1500*0.6 = 2700（そのまま円）
    expect(estimateMonthly(500, 1500, "JPY", 155)).toBe("¥2,700");
  });

  it("JPY価格はそのまま円表示する", () => {
    expect(estimateMonthly(500, 1500, "JPY")).toBe("¥2,700");
  });

  it("両方0なら¥0を返す", () => {
    expect(estimateMonthly(0, 0, "USD", 160)).toBe("¥0");
  });
});
