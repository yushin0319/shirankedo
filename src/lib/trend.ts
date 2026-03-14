// NEW判定: published_at が7日以内ならtrue
export function isNewRepo(
  publishedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!publishedAt) return false;
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return publishedAt >= sevenDaysAgo.toISOString().slice(0, 10);
}
