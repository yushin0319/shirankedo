import { sanitizeGitHubName as safe } from "./sanitize-github-name";

export interface StarBatch {
  query: string;
  repoMap: Record<string, string>;
  batchIndex: number;
}

const BATCH_SIZE = 50;

/**
 * tracking_repos の配列から GraphQL バッチを作る（50リポ/バッチ）。
 * 50 件超は GitHub GraphQL のクエリ複雑度上限に抵触するため固定。
 */
export function buildStarBatches(repos: { repo: string }[]): StarBatch[] {
  if (!repos.length) return [];
  const batches: StarBatch[] = [];
  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    const repoMap: Record<string, string> = {};
    const parts = batch.map((r, idx) => {
      const alias = `r${i + idx}`;
      const [owner, name] = r.repo.split("/");
      repoMap[alias] = r.repo;
      return `${alias}: repository(owner: "${safe(owner)}", name: "${safe(name)}") { nameWithOwner stargazerCount }`;
    });
    batches.push({
      query: `{${parts.join(" ")}}`,
      repoMap,
      batchIndex: batches.length,
    });
  }
  return batches;
}
