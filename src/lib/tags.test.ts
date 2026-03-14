import { describe, expect, it } from "vitest";
import { getTagKey } from "./tags";

describe("getTagKey", () => {
  const cases = [
    { name: "AI → ai", input: "AI", expected: "ai" },
    { name: "LLM → ai", input: "LLM", expected: "ai" },
    {
      name: "セキュリティ → security",
      input: "セキュリティ",
      expected: "security",
    },
    {
      name: "フロントエンド → frontend",
      input: "フロントエンド",
      expected: "frontend",
    },
    {
      name: "バックエンド → backend",
      input: "バックエンド",
      expected: "backend",
    },
    { name: "インフラ → infra", input: "インフラ", expected: "infra" },
    { name: "DevOps → devops", input: "DevOps", expected: "devops" },
    { name: "データ → data", input: "データ", expected: "data" },
    {
      name: "未知のタグはフォールバックを返す",
      input: "不明なタグ",
      expected: "career",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(getTagKey(input)).toBe(expected);
  });
});
