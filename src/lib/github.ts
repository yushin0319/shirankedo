/** リポジトリ名（owner/name）からGitHub URLを生成 */
export function repoToGitHubUrl(repo: string): string {
  return `https://github.com/${repo}`;
}
