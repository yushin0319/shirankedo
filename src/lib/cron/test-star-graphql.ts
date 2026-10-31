import { buildStarBatches } from "./build-star-batches";
import type { SubrequestBudget } from "./daily-stars";

// daily-stars のテスト用の、GitHub GraphQL の応答の偽物と小道具。
// 応答の形 (エラーの type / path、data の null) は本番の graphql_partial_error ログに合わせている。

export const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

export const resourceLimited = (alias: string) => ({
  type: "RESOURCE_LIMITS_EXCEEDED",
  path: [alias, "nameWithOwner"],
  message: "Resource limits for this query exceeded.",
});
export const notFound = (alias: string) => ({
  type: "NOT_FOUND",
  path: [alias],
  message: "Could not resolve to a Repository with the name 'x'.",
});

/** owner{i}/repo{i} を n 件並べた 1 バッチ (エイリアスは r0..r{n-1}) */
export const batchOf = (n: number) =>
  buildStarBatches(
    Array.from({ length: n }, (_, i) => ({ repo: `owner${i}/repo${i}` })),
  )[0];

/** GraphQL の POST 本文から、問い合わせたエイリアスと owner/name の組を取り出す */
export const requested = (init?: RequestInit) => {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  return [
    ...query.matchAll(
      /(r\d+): repository\(owner: "([^"]*)", name: "([^"]*)"\)/g,
    ),
  ].map((m) => ({ alias: m[1], repo: `${m[2]}/${m[3]}` }));
};
export const aliasesOf = (init?: RequestInit) =>
  requested(init).map((r) => r.alias);

/** 問い合わせられたエイリアスを全部そろえて返す成功応答 */
export const allFound = (init?: RequestInit) =>
  jsonResponse({
    data: Object.fromEntries(
      requested(init).map((r) => [
        r.alias,
        { nameWithOwner: r.repo, stargazerCount: 1 },
      ]),
    ),
  });

/** notFoundAliases だけ NOT_FOUND (削除済み) で null、ほかは全部そろう応答 */
export const allFoundExcept = (
  init: RequestInit | undefined,
  notFoundAliases: string[],
) =>
  jsonResponse({
    data: Object.fromEntries(
      requested(init).map((r) => [
        r.alias,
        notFoundAliases.includes(r.alias)
          ? null
          : { nameWithOwner: r.repo, stargazerCount: 1 },
      ]),
    ),
    errors: notFoundAliases.map(notFound),
  });

/** 1 実行の最初 (何も使っていない) の subrequest の台帳 */
export const freshBudget = (
  over: Partial<SubrequestBudget> = {},
): SubrequestBudget => ({ used: 0, pending: 0, refetchLeft: 6, ...over });

/** 問い合わせられたエイリアスが全部 RESOURCE_LIMITS_EXCEEDED で null になる応答 */
export const allLimited = (aliases: string[]) =>
  jsonResponse({ data: null, errors: aliases.map(resourceLimited) });
