import { sanitizeGitHubName as safe } from "./sanitize-github-name";

export interface StarBatch {
  query: string;
  repoMap: Record<string, string>;
  batchIndex: number;
}

const BATCH_SIZE = 100;

/**
 * tracking_repos の配列から GraphQL バッチを作る（100リポ/バッチ）。
 * stargazerCount は 1 field/repo で軽い (100 件 × 1 = 100 nodes、
 * GitHub maxNodeLimit 500,000 内)。Cloudflare Workers の subrequest 50 limit
 * を回避するため batch サイズを増やしている (旧 50 → 100 で half subreq)。
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
