import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db/client";
import { repoStats, trackingRepos } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { buildStarBatches } from "./build-star-batches";
import {
  type DailyStarsEnv,
  fetchBatch,
  refetchBudgetFor,
  runDailyStars,
} from "./daily-stars";

vi.mock("../../db/client", () => ({ getDb: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const resourceLimited = (alias: string) => ({
  type: "RESOURCE_LIMITS_EXCEEDED",
  path: [alias, "nameWithOwner"],
  message: "Resource limits for this query exceeded.",
});
const notFound = (alias: string) => ({
  type: "NOT_FOUND",
  path: [alias],
  message: "Could not resolve to a Repository with the name 'x'.",
});

/** owner{i}/repo{i} を n 件並べた 1 バッチ (エイリアスは r0..r{n-1}) */
const batchOf = (n: number) =>
  buildStarBatches(
    Array.from({ length: n }, (_, i) => ({ repo: `owner${i}/repo${i}` })),
  )[0];

/** GraphQL の POST 本文から、問い合わせたエイリアスと owner/name の組を取り出す */
const requested = (init?: RequestInit) => {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  return [
    ...query.matchAll(
      /(r\d+): repository\(owner: "([^"]*)", name: "([^"]*)"\)/g,
    ),
  ].map((m) => ({ alias: m[1], repo: `${m[2]}/${m[3]}` }));
};
const aliasesOf = (init?: RequestInit) => requested(init).map((r) => r.alias);

/** 問い合わせられたエイリアスを全部そろえて返す成功応答 */
const allFound = (init?: RequestInit) =>
  jsonResponse({
    data: Object.fromEntries(
      requested(init).map((r) => [
        r.alias,
        { nameWithOwner: r.repo, stargazerCount: 1 },
      ]),
    ),
  });

/** 問い合わせられたエイリアスが全部 RESOURCE_LIMITS_EXCEEDED で null になる応答 */
const allLimited = (aliases: string[]) =>
  jsonResponse({ data: null, errors: aliases.map(resourceLimited) });

describe("fetchBatch の RESOURCE_LIMITS_EXCEEDED 取り直し", () => {
  it("RESOURCE_LIMITS_EXCEEDED で null になった分だけ取り直して全件そろう", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const aliases = aliasesOf(init);
        calls.push(aliases);
        if (calls.length === 1) {
          // r0 は取れた / r1 は削除済み (NOT_FOUND) / r2・r3 は上限超過で null
          return jsonResponse({
            data: {
              r0: { nameWithOwner: "owner0/repo0", stargazerCount: 10 },
              r1: null,
              r2: null,
              r3: null,
            },
            errors: [
              notFound("r1"),
              resourceLimited("r2"),
              resourceLimited("r3"),
            ],
          });
        }
        return allFound(init);
      },
    );

    const result = await fetchBatch(batchOf(4), "TOKEN", { remaining: 6 });

    expect(calls).toEqual([
      ["r0", "r1", "r2", "r3"],
      ["r2", "r3"],
    ]);
    expect(result.stars.map((s) => s.repo).sort()).toEqual([
      "owner0/repo0",
      "owner2/repo2",
      "owner3/repo3",
    ]);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 2,
      unrecovered: 0,
    });
  });

  it("取り直しも RESOURCE_LIMITS_EXCEEDED なら半分に割って取り直し、それでも取れない件数を結果に載せる", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const aliases = aliasesOf(init);
        calls.push(aliases);
        return allLimited(aliases);
      },
    );

    const result = await fetchBatch(batchOf(4), "TOKEN", { remaining: 6 });

    // 本体 1 回 → まとめて取り直し 1 回 → 半分ずつ 2 回 (2 段まで)
    expect(calls).toEqual([
      ["r0", "r1", "r2", "r3"],
      ["r0", "r1", "r2", "r3"],
      ["r0", "r1"],
      ["r2", "r3"],
    ]);
    expect(result.stars).toEqual([]);
    expect(result.refetch).toEqual({
      requests: 3,
      recovered: 0,
      unrecovered: 4,
    });
  });

  it("NOT_FOUND だけで null になったエイリアスは取り直さない", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        data: {
          r0: { nameWithOwner: "owner0/repo0", stargazerCount: 10 },
          r1: null,
          r2: { nameWithOwner: "owner2/repo2", stargazerCount: 20 },
        },
        errors: [notFound("r1")],
      }),
    );

    const result = await fetchBatch(batchOf(3), "TOKEN", { remaining: 6 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.stars).toHaveLength(2);
    expect(result.refetch).toEqual({
      requests: 0,
      recovered: 0,
      unrecovered: 0,
    });
  });

  it("取り直しの回数は budget で止まり、残りは取れなかった件数に入る", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const aliases = aliasesOf(init);
        calls.push(aliases);
        return calls.length === 1 ? allLimited(aliases) : allFound(init);
      },
    );
    const budget = { remaining: 1 };

    const result = await fetchBatch(batchOf(150), "TOKEN", budget);

    // 150 件の取り直しは 75 件ずつ 2 回の予定だが、残り 1 回分しか無い
    expect(calls).toHaveLength(2);
    expect(calls[1]).toHaveLength(75);
    expect(budget.remaining).toBe(0);
    expect(result.stars).toHaveLength(75);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 75,
      unrecovered: 75,
    });
  });

  it("取り直しが HTTP エラーなら再試行で待たずに、取れなかった件数へ入れる", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(allLimited(["r0", "r1"]))
      .mockResolvedValue(new Response("bad gateway", { status: 502 }));

    const result = await fetchBatch(batchOf(2), "TOKEN", { remaining: 6 });

    // 取り直し 1 回が 502 → fetchWithRetry の再試行はしない (subrequest を増やさない)
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 0,
      unrecovered: 2,
    });
  });
});

describe("refetchBudgetFor", () => {
  it("subrequest 50 回の枠から本体の分と再試行の予備を引いた残りを、最大 6 回まで使う", () => {
    // warm-up 1 + GraphQL 32 + 通知 1 + HC ping 1 = 35、予備 5 → 残り 10 → 上限 6
    expect(refetchBudgetFor(32)).toBe(6);
    expect(refetchBudgetFor(40)).toBe(2);
    expect(refetchBudgetFor(42)).toBe(0);
    expect(refetchBudgetFor(45)).toBe(0);
  });
});

describe("runDailyStars の取り直し結果の報告", () => {
  it("取り直しても取れなかった件数を daily_stars_done と obs warning に載せる", async () => {
    const { db } = createTestDbWithTables();
    vi.mocked(getDb).mockReturnValue(db);
    // 200 repos → 150 + 50 の 2 batch
    await db.insert(trackingRepos).values(
      Array.from({ length: 200 }, (_, i) => ({
        repo: `owner${i}/repo${i}`,
        displayName: `repo${i}`,
      })),
    );

    let graphqlCalls = 0;
    const obsBodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/zen")) return new Response("ok", { status: 200 });
        if (url.includes("api.github.com/graphql")) {
          graphqlCalls += 1;
          const aliases = aliasesOf(init);
          // batch 0 (150 件) は全件取れる / batch 1 (50 件) は取り直しても上限超過のまま
          return aliases.includes("r0") ? allFound(init) : allLimited(aliases);
        }
        if (url.includes("obs-notify")) {
          obsBodies.push(JSON.parse(String(init?.body)));
          return new Response("ok", { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });

    const env: DailyStarsEnv = {
      DB: db as unknown as D1Database,
      GITHUB_TOKEN: "TOKEN",
      DAILY_STARS_ENABLED: "true",
      N8N_WEBHOOK_SECRET: "secret",
    };
    const result = await runDailyStars(env);

    // 本体 2 回 + batch 1 の取り直し (50 件 1 回 → 25 件 × 2 回)
    expect(graphqlCalls).toBe(5);
    expect(result.inserted).toBe(150);
    expect(await db.select().from(repoStats)).toHaveLength(150);

    const done = logs
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((j) => j?.type === "daily_stars_done");
    expect(done).toMatchObject({
      skipped_batches: 0,
      refetch_requests: 3,
      refetch_recovered: 0,
      refetch_unrecovered: 50,
    });

    expect(obsBodies).toHaveLength(1);
    expect(obsBodies[0].severity).toBe("warning");
    expect(String(obsBodies[0].subject)).toContain("取り直し失敗 50 件");
  });
});
