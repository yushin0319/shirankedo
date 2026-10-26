import { sanitizeGitHubName as safe } from "./sanitize-github-name";

export interface StarBatch {
  query: string;
  repoMap: Record<string, string>;
  batchIndex: number;
}

const BATCH_SIZE = 150;

/**
 * tracking_repos の配列から GraphQL バッチを作る（150リポ/バッチ）。
 * Cloudflare Workers Free の subrequest は 1 実行 50 回まで。100 件ずつだと
 * 追跡 4,598 件で 1 実行 49 回 (warm-up + GraphQL 46 + 通知 + HC ping) になり、
 * 2026-10-25 は 403 の再試行 2 回で上限に当たって HC ping が落ちた。
 * 150 件なら同じ件数で約 34 回。GitHub は 1 クエリ 175 件までは通り、200 件は
 * "Resource limits for this query exceeded" で全件拒否した (2026-10-27 実測) ので上げすぎない。
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
