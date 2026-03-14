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
  it("USD価格を円換算して月額目安を返す", () => {
    // input=2.50, output=10.00 → avg=6.25 → 6.25*150=937.5 → ¥938
    const result = estimateMonthly(2.5, 10, "USD");
    expect(result).toBe("¥938");
  });

  it("JPY価格はそのまま円表示する", () => {
    // input=500, output=1500 → avg=1000 → ¥1,000
    const result = estimateMonthly(500, 1500, "JPY");
    expect(result).toBe("¥1,000");
  });

  it("両方0なら¥0を返す", () => {
    expect(estimateMonthly(0, 0, "USD")).toBe("¥0");
  });
});
