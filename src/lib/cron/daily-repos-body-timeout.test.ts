import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db/client";
import { createTestDbWithTables } from "../../db/test-helper";
import { type DailyReposEnv, runDailyRepos } from "./daily-repos";

vi.mock("../../db/client", () => ({ getDb: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

// ヘッダ (status 200) までは返るが、本文を読むと AbortSignal.timeout の TimeoutError になる応答
const bodyTimeoutResponse = () =>
  new Response(
    new ReadableStream({
      pull(controller) {
        controller.error(
          new DOMException(
            "The operation was aborted due to timeout",
            "TimeoutError",
          ),
        );
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("runDailyRepos の GitHub Search 本文タイムアウト", () => {
  it("1 回目の検索の本文受信中にタイムアウトしても再試行して完走する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { db } = createTestDbWithTables();
    vi.mocked(getDb).mockReturnValue(db);

    let searchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("https://api.github.com/search/repositories")) {
          searchCalls += 1;
          if (searchCalls === 1) return bodyTimeoutResponse();
          return jsonResponse({ items: [] });
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );

    // DAILY_REPOS_ENABLED 未設定 = dry-run (D1 書き込み・通知・ping なし)
    const env: DailyReposEnv = {
      DB: db as unknown as D1Database,
      GITHUB_TOKEN: "TOKEN",
      GEMINI_API_KEY: "KEY",
    };
    const promise = runDailyRepos(env);
    const expectation = expect(promise).resolves.toBeUndefined();
    // 検索 10 回の間隔 (2s × 9) + 再試行の待ち (1s)
    await vi.advanceTimersByTimeAsync(30000);
    await expectation;

    // 検索 10 回 + 本文タイムアウトの再試行 1 回
    expect(searchCalls).toBe(11);
  }, 60000);
});
