import { describe, expect, it } from "vitest";
import { extractUniqueTags, filterByTag } from "./news-filter";

// 記事のタグ情報だけを持つ最小構造
interface TaggedItem {
  tags: string[];
}

const items: TaggedItem[] = [
  { tags: ["AI", "セキュリティ"] },
  { tags: ["フロントエンド"] },
  { tags: ["AI"] },
  { tags: ["セキュリティ", "インフラ"] },
  { tags: ["データ"] },
];

describe("filterByTag", () => {
  it("タグ指定でそのタグを持つ記事だけ返す", () => {
    const result = filterByTag(items, "AI");
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.tags.includes("AI"))).toBe(true);
  });

  it("セキュリティで絞り込める", () => {
    const result = filterByTag(items, "セキュリティ");
    expect(result).toHaveLength(2);
  });

  it("該当なしで空配列を返す", () => {
    const result = filterByTag(items, "存在しないタグ");
    expect(result).toHaveLength(0);
  });

  it("nullやundefinedのタグで全件返す", () => {
    expect(filterByTag(items, null)).toHaveLength(items.length);
    expect(filterByTag(items, undefined)).toHaveLength(items.length);
  });
});

describe("extractUniqueTags", () => {
  it("全記事からユニークなタグ一覧を返す", () => {
    const tags = extractUniqueTags(items);
    expect(tags).toEqual([
      "AI",
      "セキュリティ",
      "フロントエンド",
      "インフラ",
      "データ",
    ]);
  });

  it("空配列で空配列を返す", () => {
    expect(extractUniqueTags([])).toEqual([]);
  });

  it("出現順を保持する", () => {
    const tags = extractUniqueTags([
      { tags: ["データ", "AI"] },
      { tags: ["AI", "セキュリティ"] },
    ]);
    expect(tags).toEqual(["データ", "AI", "セキュリティ"]);
  });
});
