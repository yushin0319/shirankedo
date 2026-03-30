import { NEW_REPO_DAYS, TREND_DIFF_WINDOW_HOURS } from "./constants";

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

const WINDOW_MS = TREND_DIFF_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * stats配列からリポ毎のstar差分を計算し、diff降順でソート+LIMITする。
 * 最新スナップショットのcreatedAtから TREND_DIFF_WINDOW_HOURS 以内の
 * 最古スナップショットを前回分として採用する。
 * stats は createdAt 降順（最新が先）を想定。
 */
export function rankTrendRepos<T extends RepoInput>(
  repos: readonly T[],
  stats: readonly StatInput[],
  limit: number,
): RankedRepo<T>[] {
  // リポ毎にスナップショットをグループ化（createdAt降順のまま）
  const repoSnapshots = new Map<string, { stars: number; time: number }[]>();
  for (const stat of stats) {
    if (!stat.createdAt) continue;
    const arr = repoSnapshots.get(stat.repo);
    const entry = {
      stars: stat.stars,
      time: new Date(stat.createdAt).getTime(),
    };
    if (arr) {
      arr.push(entry);
    } else {
      repoSnapshots.set(stat.repo, [entry]);
    }
  }

  // 各リポのdiffを計算
  const repoMap = new Map<string, { stars: number; diff: number }>();
  for (const [repo, snapshots] of repoSnapshots) {
    const latest = snapshots[0]; // createdAt降順なので先頭が最新
    // TREND_DIFF_WINDOW_HOURS 以内のスナップショットのうち最古を探す
    let oldest = latest;
    for (const snap of snapshots) {
      if (latest.time - snap.time <= WINDOW_MS) {
        oldest = snap;
      }
    }
    const diff = oldest === latest ? 0 : latest.stars - oldest.stars;
    repoMap.set(repo, { stars: latest.stars, diff });
  }

  return repos
    .map((r) => {
      const s = repoMap.get(r.repo);
      return { ...r, stars: s?.stars ?? 0, diff: s?.diff ?? 0 };
    })
    .sort((a, b) => b.diff - a.diff)
    .slice(0, limit);
}
