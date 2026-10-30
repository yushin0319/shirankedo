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
    batch.forEach((r, idx) => {
      repoMap[`r${i + idx}`] = r.repo;
    });
    batches.push({
      query: buildStarQuery(repoMap),
      repoMap,
      batchIndex: batches.length,
    });
  }
  return batches;
}

/**
 * バッチの一部のエイリアスだけを問い合わせる StarBatch を作る (取り直し用)。
 * エイリアスと batchIndex は元のまま使うので、応答の読み方とログは元のバッチと同じになる。
 */
export function buildStarSubBatch(
  batch: StarBatch,
  aliases: string[],
): StarBatch {
  const repoMap: Record<string, string> = {};
  for (const alias of aliases) {
    const repo = batch.repoMap[alias];
    if (repo !== undefined) repoMap[alias] = repo;
  }
  return {
    query: buildStarQuery(repoMap),
    repoMap,
    batchIndex: batch.batchIndex,
  };
}

function buildStarQuery(repoMap: Record<string, string>): string {
  const parts = Object.entries(repoMap).map(([alias, repo]) => {
    const [owner, name] = repo.split("/");
    return `${alias}: repository(owner: "${safe(owner)}", name: "${safe(name)}") { nameWithOwner stargazerCount }`;
  });
  return `{${parts.join(" ")}}`;
}
