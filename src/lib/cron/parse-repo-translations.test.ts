import { describe, expect, it } from "vitest";
import { parseRepoTranslations } from "./parse-repo-translations";

const repo = (name: string) => ({
  repo: `owner/${name}`,
  description: `original ${name}`,
  language: "TypeScript",
  stars: 1000,
});

describe("parseRepoTranslations", () => {
  it("「番号. 表示名 | 説明」の行を翻訳結果にする", () => {
    const batch = [repo("a"), repo("b")];
    const text = "1. Repo A | リポAの説明\n2. Repo B | リポBの説明";

    expect(parseRepoTranslations(batch, text)).toEqual({
      translations: [
        {
          repo: "owner/a",
          displayName: "Repo A",
          description: "リポAの説明",
          language: "TypeScript",
          stars: 1000,
        },
        {
          repo: "owner/b",
          displayName: "Repo B",
          description: "リポBの説明",
          language: "TypeScript",
          stars: 1000,
        },
      ],
      skipped: [],
    });
  });

  it("応答が空（Gemini 失敗）ならすべて skip して原文で保存しない", () => {
    const batch = [repo("a"), repo("b")];

    expect(parseRepoTranslations(batch, "")).toEqual({
      translations: [],
      skipped: ["owner/a", "owner/b"],
    });
  });

  it("行数が足りない場合は足りない分だけ skip する", () => {
    const batch = [repo("a"), repo("b"), repo("c")];
    const text = "1. Repo A | リポAの説明\n2. Repo B | リポBの説明";

    const result = parseRepoTranslations(batch, text);
    expect(result.translations.map((t) => t.repo)).toEqual([
      "owner/a",
      "owner/b",
    ]);
    expect(result.skipped).toEqual(["owner/c"]);
  });

  it("形式が崩れた行（| なし・表示名や説明が空）は skip する", () => {
    const batch = [repo("a"), repo("b"), repo("c")];
    const text = "1. 区切りなし\n2.  | リポBの説明\n3. Repo C |   ";

    expect(parseRepoTranslations(batch, text)).toEqual({
      translations: [],
      skipped: ["owner/a", "owner/b", "owner/c"],
    });
  });

  it("説明に | が含まれていても 2 つ目以降を説明として扱う", () => {
    const batch = [repo("a")];
    const text = "1. Repo A | 説明 | 補足";

    expect(parseRepoTranslations(batch, text).translations[0].description).toBe(
      "説明 | 補足",
    );
  });
});
