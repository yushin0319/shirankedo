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

type RepoInput = {
  repo: string;
  [key: string]: unknown;
};

type StatInput = {
  repo: string;
  stars: number;
  createdAt: string | null;
};

type RankedRepo<T extends RepoInput> = T & {
  stars: number;
  diff: number;
};

/**
 * stats配列からリポ毎のstar差分を計算し、diff降順でソート+LIMITする。
 * stats は createdAt 降順（最新が先）を想定。
 */
export function rankTrendRepos<T extends RepoInput>(
  repos: readonly T[],
  stats: readonly StatInput[],
  limit: number,
): RankedRepo<T>[] {
  const repoMap = new Map<
    string,
    { stars: number; prevStars: number; diff: number }
  >();
  for (const stat of stats) {
    const existing = repoMap.get(stat.repo);
    if (!existing) {
      repoMap.set(stat.repo, { stars: stat.stars, prevStars: 0, diff: 0 });
    } else if (existing.prevStars === 0) {
      existing.prevStars = stat.stars;
      existing.diff = existing.stars - stat.stars;
    }
  }

  return repos
    .map((r) => {
      const s = repoMap.get(r.repo);
      return { ...r, stars: s?.stars ?? 0, diff: s?.diff ?? 0 };
    })
    .sort((a, b) => b.diff - a.diff)
    .slice(0, limit);
}
