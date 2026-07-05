import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./cron-shared";

const okResponse = (body = "{}") =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchWithRetry", () => {
  it("5xx → 200 で retry が効いて成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("service unavailable", { status: 503 }),
      )
      .mockResolvedValueOnce(okResponse());

    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", context: "q=0" },
    );

    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("非 retry 対象 (404) は即 throw する", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(
      fetchWithRetry(
        "https://example.test",
        {},
        { label: "T", context: "q=1" },
      ),
    ).rejects.toThrow(/T HTTP 404 q=1 \(after 1 attempts\)/);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("maxAttempts まで 5xx が続けば (after N attempts) で throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("bad gateway", { status: 502 }));

    const promise = fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", context: "q=2", maxAttempts: 3 },
    );
    const expectation = expect(promise).rejects.toThrow(
      /T HTTP 502 q=2 \(after 3 attempts\)/,
    );
    // linear backoff (1+2=3s) を fake timer で advance
    await vi.advanceTimersByTimeAsync(10000);
    await expectation;
    expect(spy).toHaveBeenCalledTimes(3);
  }, 30000);

  it("fetch 例外 (timeout 等) も retry し最終的に fetch failed で throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("timed out"));

    const promise = fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", context: "q=3", maxAttempts: 2 },
    );
    const expectation = expect(promise).rejects.toThrow(
      /T fetch failed q=3 \(after 2 attempts\): Error: timed out/,
    );
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
    expect(spy).toHaveBeenCalledTimes(2);
  }, 30000);

  it("403 (secondary rate limit) は 60s 待って retry する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 403 }))
      .mockResolvedValueOnce(okResponse());

    const promise = fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", context: "q=4" },
    );
    await vi.advanceTimersByTimeAsync(61000);
    const res = await promise;

    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  }, 30000);
});
