import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBatch } from "./daily-stars";
import {
  aliasesOf,
  allFound,
  allFoundExcept,
  batchOf,
  freshBudget,
  jsonResponse,
  notFound,
  resourceLimited,
} from "./test-star-graphql";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchBatch の取りこぼしの取り直し (RESOURCE_LIMITS_EXCEEDED 以外)", () => {
  it("RESOURCE_LIMITS_EXCEEDED 以外の理由で data が null になった分も取り直す", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(aliasesOf(init));
        if (calls.length === 1) {
          // 問い合わせ全体の時間切れの形 (type も path も無いエラーで data が null)
          return jsonResponse({
            data: null,
            errors: [
              {
                message:
                  "Something went wrong while executing your query. This may be the result of a timeout, or it could be a GitHub bug.",
              },
            ],
          });
        }
        return allFound(init);
      },
    );

    const result = await fetchBatch(batchOf(4), "TOKEN", freshBudget());

    expect(calls).toEqual([
      ["r0", "r1", "r2", "r3"],
      ["r0", "r1", "r2", "r3"],
    ]);
    expect(result.stars).toHaveLength(4);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 4,
      unrecovered: 0,
    });
  });

  it("本体の応答が JSON として読めなければ (本文の途中切れ) 全件を取り直す", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(aliasesOf(init));
        if (calls.length === 1) {
          return new Response('{"data":{"r0":{"nameWithOwner":"own', {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return allFound(init);
      },
    );

    const result = await fetchBatch(batchOf(3), "TOKEN", freshBudget());

    expect(calls).toEqual([
      ["r0", "r1", "r2"],
      ["r0", "r1", "r2"],
    ]);
    expect(result.stars).toHaveLength(3);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 3,
      unrecovered: 0,
    });
  });

  it("NOT_FOUND の件数を結果に載せる (取り直しの応答で見つかった分も含める)", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(aliasesOf(init));
        // 本体: r1 は NOT_FOUND、r2・r3 は上限超過 / 取り直し: r3 が NOT_FOUND
        return calls.length === 1
          ? jsonResponse({
              data: {
                r0: { nameWithOwner: "owner0/repo0", stargazerCount: 1 },
                r1: null,
                r2: null,
                r3: null,
              },
              errors: [
                notFound("r1"),
                resourceLimited("r2"),
                resourceLimited("r3"),
              ],
            })
          : allFoundExcept(init, ["r3"]);
      },
    );

    const result = await fetchBatch(batchOf(4), "TOKEN", freshBudget());

    expect(result.stars).toHaveLength(2);
    expect(result.notFound).toBe(2);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 1,
      unrecovered: 0,
    });
  });
});
