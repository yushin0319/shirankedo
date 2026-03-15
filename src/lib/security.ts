export type RepoInfo = { displayName: string; description: string | null };

// リリースの表示名を解決: tracking_reposにあればdisplay_name、なければrepoスラッグ
export function resolveReleaseName(
  repo: string,
  repoMap: Record<string, RepoInfo>,
): string {
  return repoMap[repo]?.displayName ?? repo;
}

// リリースの説明文を解決: tracking_reposにあればdescription、なければnull
export function resolveReleaseDescription(
  repo: string,
  repoMap: Record<string, RepoInfo>,
): string | null {
  return repoMap[repo]?.description ?? null;
}
