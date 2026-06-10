import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db/client";
import { repoStats, trackingRepos } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { type DailyStarsEnv, runDailyStars } from "./daily-stars";

// runDailyStars は内部で getDb(env.DB) を呼び D1 ドライバで包む。
// テストでは in-memory (better-sqlite3) DB を返すよう差し替える。
vi.mock("../../db/client", () => ({ getDb: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("runDailyStars graceful skip", () => {
  it("1 batch が恒久失敗しても全体を止めず、成功分を保存し obs warning を出す", async () => {
    const { db } = createTestDbWithTables();
    vi.mocked(getDb).mockReturnValue(db);
    // 150 repos → BATCH_SIZE=100 で 2 batch (100 + 50)
    const repos = Array.from({ length: 150 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
      displayName: `repo${i}`,
    }));
    await db.insert(trackingRepos).values(repos);

    let graphqlCalls = 0;
    const obsBodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/zen")) {
          return new Response("warmup ok", { status: 200 });
        }
        if (url.includes("api.github.com/graphql")) {
          graphqlCalls += 1;
          // batch 0 は成功 (1 件 data) / batch 1 は 400 (非 retry → 即 throw → skip)
          if (graphqlCalls === 1) {
            return jsonResponse({
              data: {
                r0: { nameWithOwner: "facebook/react", stargazerCount: 100 },
              },
            });
          }
          return new Response("bad request", { status: 400 });
        }
        if (url.includes("obs-notify")) {
          obsBodies.push(JSON.parse(String(init?.body)));
          return new Response("ok", { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );

    const env: DailyStarsEnv = {
      DB: db as unknown as D1Database,
      GITHUB_TOKEN: "TOKEN",
      DAILY_STARS_ENABLED: "true",
      N8N_WEBHOOK_SECRET: "secret",
      // HC_PING_KEY は未設定 → HC ping をスキップ
    };

    const result = await runDailyStars(env);

    // batch 1 が落ちても batch 0 の成功分は insert されている
    expect(graphqlCalls).toBe(2);
    expect(result.inserted).toBe(1);
    const rows = await db.select().from(repoStats);
    expect(rows).toHaveLength(1);
    expect(rows[0].repo).toBe("facebook/react");

    // 部分欠損は info で埋もれさせず warning で表に出す
    expect(obsBodies).toHaveLength(1);
    expect(obsBodies[0].severity).toBe("warning");
    expect(String(obsBodies[0].subject)).toContain("部分欠損");
  });

  it("全 batch が失敗 (例: token 失効) したら throw して cron 失敗扱いにする", async () => {
    const { db } = createTestDbWithTables();
    vi.mocked(getDb).mockReturnValue(db);
    // 50 repos → 1 batch。その唯一の batch が落ちれば全 batch 失敗。
    const repos = Array.from({ length: 50 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
      displayName: `repo${i}`,
    }));
    await db.insert(trackingRepos).values(repos);

    const obsBodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/zen")) {
          return new Response("warmup ok", { status: 200 });
        }
        if (url.includes("api.github.com/graphql")) {
          // 全 batch を失敗させる (token 失効 / 全断を模す)。retry 待ちを避ける
          // ため非 retry の 400 を使う (全失敗ガードは失敗理由を問わない)。
          return new Response("bad request", { status: 400 });
        }
        if (url.includes("obs-notify")) {
          obsBodies.push(JSON.parse(String(init?.body)));
          return new Response("ok", { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );

    const env: DailyStarsEnv = {
      DB: db as unknown as D1Database,
      GITHUB_TOKEN: "TOKEN",
      DAILY_STARS_ENABLED: "true",
      N8N_WEBHOOK_SECRET: "secret",
    };

    // 全 batch 失敗は graceful skip で握り潰さず throw する
    await expect(runDailyStars(env)).rejects.toThrow(/all 1 batches failed/);

    // throw 経路では insert も obs-notify (info/warning) も到達しない
    const rows = await db.select().from(repoStats);
    expect(rows).toHaveLength(0);
    expect(obsBodies).toHaveLength(0);
  }, 60000);
});
