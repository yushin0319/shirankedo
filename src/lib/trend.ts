import { NEW_REPO_DAYS } from "./constants";

// NEW判定: published_at が NEW_REPO_DAYS 日以内ならtrue
export function isNewRepo(
  publishedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!publishedAt) return false;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - NEW_REPO_DAYS);
  return publishedAt >= cutoff.toISOString().slice(0, 10);
}
