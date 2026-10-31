import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./cron-shared";

const okResponse = (body = "{}") =>
  new Response(body, {
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

  it("本文の受信中に TimeoutError が出たら再試行し、2 回目の本文を返す", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(bodyTimeoutResponse())
      .mockResolvedValueOnce(okResponse('{"items":[1,2]}'));

    const promise = fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", context: "q=5" },
    );
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;

    expect(spy).toHaveBeenCalledTimes(2);
    // 呼び出し元は返った Response をそのまま json() / text() で読む
    expect(await res.json()).toEqual({ items: [1, 2] });
  }, 30000);

  it("本文の受信で毎回 TimeoutError なら (after N attempts) で throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => bodyTimeoutResponse());

    const promise = fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", context: "q=6", maxAttempts: 2 },
    );
    const expectation = expect(promise).rejects.toThrow(
      /T fetch failed q=6 \(after 2 attempts\): TimeoutError/,
    );
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
    expect(spy).toHaveBeenCalledTimes(2);
  }, 30000);

  it("返す Response は status / statusText / headers / 本文を保つ", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<rss>feed</rss>", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { label: "T" },
    );

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.statusText).toBe("OK");
    expect(res.headers.get("content-type")).toBe("application/rss+xml");
    expect(await res.text()).toBe("<rss>feed</rss>");
  });

  it("onAttempt は再試行も含めて fetch を投げるたびに 1 回呼ばれる", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockRejectedValueOnce(new Error("timed out"))
      .mockResolvedValueOnce(okResponse());
    let attempts = 0;

    const promise = fetchWithRetry(
      "https://example.test",
      {},
      { label: "T", onAttempt: () => attempts++ },
    );
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(attempts).toBe(3);
  }, 30000);

  it("204 (本文なし) でも Response を返せる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { label: "T" },
    );

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
