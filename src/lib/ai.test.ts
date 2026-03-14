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
  it("USD価格を円換算して月額目安を返す", () => {
    // usd = 2.5*3.6 + 10*0.6 = 9+6 = 15 → jpy = 15*150 = 2250
    const result = estimateMonthly(2.5, 10, "USD");
    expect(result).toBe("¥2,250");
  });

  it("JPY価格はそのまま円表示する", () => {
    // usd = 500*3.6 + 1500*0.6 = 1800+900 = 2700
    const result = estimateMonthly(500, 1500, "JPY");
    expect(result).toBe("¥2,700");
  });

  it("両方0なら¥0を返す", () => {
    expect(estimateMonthly(0, 0, "USD")).toBe("¥0");
  });
});
