/**
 * タイトルが重複する記事を除去する。
 * 同じタイトルの記事が複数ある場合、配列内で最初に出現するものを残す。
 */
export function dedupeByTitle<T extends { title: string }>(
  articles: readonly T[],
): T[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });
}
