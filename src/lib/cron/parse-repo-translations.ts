// Gemini の翻訳応答（「番号. display_name | description」の行）を tracking_repos 用に変換する。
//
// 2026-08-09 / 09-16 に Gemini が HTTP 524 で落ち、そのバッチのリポが原文（英語・中国語）のまま
// D1 に保存された。daily-repos は新規リポしか処理しないため、一度そうなると翻訳されないまま残る。
// そこで翻訳できなかったリポは保存せず skip し、翌日の新規リポとして再度翻訳させる。
export interface TranslatableRepo {
  repo: string;
  description: string;
  language: string;
  stars: number;
}

export interface TranslatedRepo {
  repo: string;
  displayName: string;
  description: string;
  language: string;
  stars: number;
}

export interface ParsedRepoTranslations {
  translations: TranslatedRepo[];
  /** 翻訳できず保存しないリポ（翌日再試行される） */
  skipped: string[];
}

export function parseRepoTranslations(
  batch: TranslatableRepo[],
  text: string,
): ParsedRepoTranslations {
  const lines = text.split("\n").filter((l) => /^\d+\./.test(l.trim()));
  const translations: TranslatedRepo[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    const content = (lines[i] ?? "").replace(/^\d+\.\s*/, "").trim();
    const sep = content.indexOf("|");
    const displayName = sep >= 0 ? content.slice(0, sep).trim() : "";
    // 説明に | が含まれることがあるので最初の | 以降はすべて説明として扱う
    const description = sep >= 0 ? content.slice(sep + 1).trim() : "";
    if (!displayName || !description) {
      skipped.push(r.repo);
      continue;
    }
    translations.push({
      repo: r.repo,
      displayName,
      description,
      language: r.language,
      stars: r.stars,
    });
  }

  return { translations, skipped };
}
