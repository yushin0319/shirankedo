import { articleDecayScore } from "./score";

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

/**
 * 記事を重複排除 → decayScoreソート → LIMIT件に絞る。
 */
export function topArticles<
  T extends { title: string; impact: number; publishedAt: string },
>(articles: readonly T[], limit: number, now: Date): T[] {
  return dedupeByTitle(articles)
    .sort(
      (a, b) =>
        articleDecayScore(b.impact, b.publishedAt, now) -
        articleDecayScore(a.impact, a.publishedAt, now),
    )
    .slice(0, limit);
}
