import { afterEach, describe, expect, it, vi } from "vitest";
import { canRefetch, fetchBatch } from "./daily-stars";
import {
  aliasesOf,
  allFound,
  allLimited,
  batchOf,
  freshBudget,
} from "./test-star-graphql";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("subrequest の上限 (1 実行 50 回) を超えない", () => {
  it("取り直しは、後に要る分と再試行の予備 5 回を残せる範囲だけ投げる", async () => {
    const calls: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const aliases = aliasesOf(init);
        calls.push(aliases);
        return calls.length === 1 ? allLimited(aliases) : allFound(init);
      },
    );
    // ここまでに 40 回使い、この後に残りのバッチ 1 + 通知 + HC ping の 3 回が要る
    const budget = freshBudget({ used: 40, pending: 3 });

    const result = await fetchBatch(batchOf(150), "TOKEN", budget);

    // 本体で 41 回。取り直し 1 回で 42 回 (+後の 3 回 + 予備 5 回 = 50)。2 回目は 51 になるので投げない
    expect(calls).toHaveLength(2);
    expect(budget.used).toBe(42);
    expect(result.stars).toHaveLength(75);
    expect(result.refetch).toEqual({
      requests: 1,
      recovered: 75,
      unrecovered: 75,
    });
  });

  it("本体の問い合わせの再試行は、後に要る分を残せる回数までに抑える", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("bad gateway", { status: 502 }));
    // 46 回使っていて、この後に通知 + HC ping の 2 回が要る → このバッチに使えるのは 2 回
    const budget = freshBudget({ used: 46, pending: 2 });

    const promise = fetchBatch(batchOf(2), "TOKEN", budget);
    const expectation = expect(promise).rejects.toThrow(
      /GitHub GraphQL HTTP 502 batch=0 \(after 2 attempts\)/,
    );
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;

    expect(spy).toHaveBeenCalledTimes(2);
    expect(budget.used).toBe(48);
    vi.useRealTimers();
  }, 30000);
});

describe("canRefetch", () => {
  it("取り直し 1 回を足しても、後に要る分と再試行の予備 5 回が 50 回に収まるときだけ許す", () => {
    // 本番 (追跡 4,699 件 = 32 バッチ) で batch 24 を取り直す時点: warm-up 1 + 本体 25 = 26、残り 7 バッチ + 通知 + HC ping = 9
    expect(canRefetch({ used: 26, pending: 9, refetchLeft: 6 })).toBe(true);
    // 境界: 35 + 1 + 9 + 5 = 50 は許す / 51 になるなら許さない
    expect(canRefetch({ used: 35, pending: 9, refetchLeft: 6 })).toBe(true);
    expect(canRefetch({ used: 36, pending: 9, refetchLeft: 6 })).toBe(false);
    // 1 実行の取り直しの回数を使い切っていれば許さない
    expect(canRefetch({ used: 26, pending: 9, refetchLeft: 0 })).toBe(false);
  });
});
