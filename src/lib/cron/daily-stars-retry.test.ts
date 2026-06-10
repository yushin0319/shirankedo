import { afterEach, describe, expect, it, vi } from "vitest";
import type { StarBatch } from "./build-star-batches";
import { fetchBatch } from "./daily-stars";

const dummyBatch: StarBatch = {
  batchIndex: 0,
  query:
    '{ r0: repository(owner: "facebook", name: "react") { nameWithOwner stargazerCount } }',
  repoMap: { r0: "facebook/react" },
};

const successResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchBatch retry", () => {
  it("5xx → 200 で retry が効いて成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }))
      .mockResolvedValueOnce(
        successResponse({
          data: {
            r0: { nameWithOwner: "facebook/react", stargazerCount: 100 },
          },
        }),
      );

    const result = await fetchBatch(dummyBatch, "TOKEN");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.stars).toEqual([{ repo: "facebook/react", stars: 100 }]);
    expect(result.renames).toEqual([]);
  });

  it("MAX_ATTEMPTS まで 5xx が続けば (after N attempts) で throw", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("server error", { status: 502 }));

    // expect(...).rejects.toThrow を先に組み立てて rejection ハンドラを
    // attach しておく (これをしないと advanceTimersByTimeAsync 中に
    // unhandled rejection 判定で CI が落ちる)
    const promise = fetchBatch(dummyBatch, "TOKEN");
    const expectation = expect(promise).rejects.toThrow(
      /GitHub GraphQL HTTP 502 batch=0 \(after 5 attempts\)/,
    );
    // exponential backoff (1+4+9+16=30s) を fake timer で advance
    await vi.advanceTimersByTimeAsync(35000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  }, 60000);

  it("401 (一過性 auth) → 200 で retry が効いて成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        successResponse({
          data: {
            r0: { nameWithOwner: "facebook/react", stargazerCount: 100 },
          },
        }),
      );

    const promise = fetchBatch(dummyBatch, "TOKEN");
    // 401 は 5xx 同様 linear backoff (attempt 1 → 1s)
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.stars).toEqual([{ repo: "facebook/react", stars: 100 }]);
  }, 60000);

  it("401 が MAX_ATTEMPTS まで続けば (after N attempts) で throw", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const promise = fetchBatch(dummyBatch, "TOKEN");
    const expectation = expect(promise).rejects.toThrow(
      /GitHub GraphQL HTTP 401 batch=0 \(after 5 attempts\)/,
    );
    // linear backoff (1+2+3+4=10s) を fake timer で advance
    await vi.advanceTimersByTimeAsync(15000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  }, 60000);

  it("403 (secondary rate limit) → 200 で retry が効いて成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 403 }))
      .mockResolvedValueOnce(
        successResponse({
          data: {
            r0: { nameWithOwner: "facebook/react", stargazerCount: 100 },
          },
        }),
      );

    const promise = fetchBatch(dummyBatch, "TOKEN");
    // 403 は 60s 固定 sleep
    await vi.advanceTimersByTimeAsync(61000);
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.stars).toEqual([{ repo: "facebook/react", stars: 100 }]);
  }, 60000);

  it("403 が MAX_ATTEMPTS まで続けば (after N attempts) で throw", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("rate limited", { status: 403 }));

    const promise = fetchBatch(dummyBatch, "TOKEN");
    const expectation = expect(promise).rejects.toThrow(
      /GitHub GraphQL HTTP 403 batch=0 \(after 5 attempts\)/,
    );
    // 60s x 4 retry = 240s
    await vi.advanceTimersByTimeAsync(250000);
    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  }, 60000);
});
