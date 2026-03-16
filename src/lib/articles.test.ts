import { describe, expect, it } from "vitest";
import { dedupeByTitle } from "./articles";

interface Article {
  title: string;
  url: string;
  impact: number;
  publishedAt: string;
}

const make = (
  title: string,
  url: string,
  impact = 5,
  publishedAt = "2026-03-15",
): Article => ({ title, url, impact, publishedAt });

describe("dedupeByTitle", () => {
  it("重複がなければそのまま返す", () => {
    const input = [
      make("記事A", "https://a.com"),
      make("記事B", "https://b.com"),
    ];
    expect(dedupeByTitle(input)).toHaveLength(2);
  });

  it("同じタイトルがある場合、最初の1件だけ残す", () => {
    const input = [
      make("同じタイトル", "https://a.com"),
      make("同じタイトル", "https://b.com"),
      make("別の記事", "https://c.com"),
    ];
    const result = dedupeByTitle(input);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("https://a.com");
    expect(result[1].url).toBe("https://c.com");
  });

  it("空配列で空配列を返す", () => {
    expect(dedupeByTitle([])).toEqual([]);
  });

  it("3件以上の同一タイトルでも1件だけ残す", () => {
    const input = [
      make("重複記事", "https://a.com"),
      make("重複記事", "https://b.com"),
      make("重複記事", "https://c.com"),
    ];
    expect(dedupeByTitle(input)).toHaveLength(1);
  });

  it("元の配列を変更しない", () => {
    const input = [
      make("同じ", "https://a.com"),
      make("同じ", "https://b.com"),
    ];
    const original = [...input];
    dedupeByTitle(input);
    expect(input).toEqual(original);
  });
});
