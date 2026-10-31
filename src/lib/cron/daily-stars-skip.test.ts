import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db/client";
import { repoStats, trackingRepos } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { type DailyStarsEnv, runDailyStars } from "./daily-stars";
import { fakeObsBinding } from "./test-obs-binding";

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
    // 200 repos → BATCH_SIZE=150 で 2 batch (150 + 50)
    const repos = Array.from({ length: 200 }, (_, i) => ({
      repo: `owner${i}/repo${i}`,
      displayName: `repo${i}`,
    }));
    await db.insert(trackingRepos).values(repos);

    let graphqlCalls = 0;
    const obsBodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/zen")) {
          return new Response("warmup ok", { status: 200 });
        }
        if (url.includes("api.github.com/graphql")) {
          graphqlCalls += 1;
          // batch 0 (r0..r149) は全件成功 / batch 1 は 400 (非 retry → 即 throw → skip)
          if (graphqlCalls === 1) {
            return jsonResponse({
              data: Object.fromEntries(
                repos
                  .slice(0, 150)
                  .map((r, i) => [
                    `r${i}`,
                    { nameWithOwner: r.repo, stargazerCount: 100 },
                  ]),
              ),
            });
          }
          return new Response("bad request", { status: 400 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );

    const env: DailyStarsEnv = {
      DB: db as unknown as D1Database,
      GITHUB_TOKEN: "TOKEN",
      DAILY_STARS_ENABLED: "true",
      N8N_WEBHOOK_SECRET: "secret",
      OBS: fakeObsBinding(obsBodies).binding,
      // HC_PING_KEY は未設定 → HC ping をスキップ
    };

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });

    const result = await runDailyStars(env);

    // batch 1 が落ちても batch 0 の成功分は insert されている
    expect(graphqlCalls).toBe(2);
    expect(result.inserted).toBe(150);
    const rows = await db.select().from(repoStats);
    expect(rows).toHaveLength(150);

    // 落ちた batch のリポ数を取りこぼしとして数える
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
      fetched: 150,
      skipped_batches: 1,
      skipped_repos: 50,
    });

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
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/zen")) {
          return new Response("warmup ok", { status: 200 });
        }
        if (url.includes("api.github.com/graphql")) {
          // 全 batch を失敗させる (token 失効 / 全断を模す)。retry 待ちを避ける
          // ため非 retry の 400 を使う (全失敗ガードは失敗理由を問わない)。
          return new Response("bad request", { status: 400 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );

    const env: DailyStarsEnv = {
      DB: db as unknown as D1Database,
      GITHUB_TOKEN: "TOKEN",
      DAILY_STARS_ENABLED: "true",
      N8N_WEBHOOK_SECRET: "secret",
      OBS: fakeObsBinding(obsBodies).binding,
    };

    // 全 batch 失敗は graceful skip で握り潰さず throw する
    await expect(runDailyStars(env)).rejects.toThrow(/all 1 batches failed/);

    // throw 経路では insert も obs-notify (info/warning) も到達しない
    const rows = await db.select().from(repoStats);
    expect(rows).toHaveLength(0);
    expect(obsBodies).toHaveLength(0);
  }, 60000);
});
