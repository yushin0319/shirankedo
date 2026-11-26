import { afterEach, describe, expect, it, vi } from "vitest";
import { callGemini } from "./cron-shared";

const geminiOk = () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("callGemini", () => {
  it("524 のあと backoff 経過後に再送し、2 回目の 200 を返す", async () => {
    // Given: 1 回目は Cloudflare の 524、2 回目は成功
    vi.useFakeTimers();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("error code: 524", { status: 524 }))
      .mockResolvedValueOnce(geminiOk());

    // When
    const promise = callGemini("k", "gemini-2.5-flash", "{}", {
      maxAttempts: 2,
      backoffMs: 10000,
    });

    // Then: backoff が終わるまでは再送しない
    await vi.advanceTimersByTimeAsync(9999);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const res = await promise;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe("ok");
  });

  it("オプション未指定なら再試行せず、従来どおりの形式で throw する", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("error code: 524", { status: 524 }));

    await expect(callGemini("k", "gemini-2.5-flash", "{}")).rejects.toThrow(
      "Gemini gemini-2.5-flash HTTP 524: error code: 524",
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("オプション未指定で fetch 自体が失敗したら、元の例外をそのまま投げる", async () => {
    const original = new Error("network down");
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(original);

    await expect(callGemini("k", "m", "{}")).rejects.toBe(original);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("400 は再試行対象外で即 throw する", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(
      callGemini("k", "m", "{}", { maxAttempts: 2, backoffMs: 10 }),
    ).rejects.toThrow("Gemini m HTTP 400: bad request");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("429 は再試行して成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("quota", { status: 429 }))
      .mockResolvedValueOnce(geminiOk());

    await callGemini("k", "m", "{}", { maxAttempts: 2, backoffMs: 10 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("5xx が最後まで続けば最後のステータスで throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      // Response の本文は 1 回しか読めないので呼び出しごとに作る
      .mockImplementation(
        async () => new Response("unavailable", { status: 503 }),
      );

    await expect(
      callGemini("k", "m", "{}", { maxAttempts: 2, backoffMs: 10 }),
    ).rejects.toThrow("Gemini m HTTP 503: unavailable (after 2 attempts)");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("fetch 自体の失敗 (タイムアウト等) も再試行し、尽きたら throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("The operation was aborted due to timeout"));

    await expect(
      callGemini("k", "m", "{}", { maxAttempts: 2, backoffMs: 10 }),
    ).rejects.toThrow(/Gemini m fetch failed \(after 2 attempts\): .*timeout/);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("API キーは URL のクエリではなく x-goog-api-key ヘッダで送る", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiOk());

    await callGemini("secret-key", "gemini-2.5-flash", "{}");

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("secret-key");
  });
});

describe("callGemini (中継 gemini-relay 経由)", () => {
  it("relay を渡すと relay の fetch で送り、グローバル fetch は使わない", async () => {
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("global fetch must not be used"));
    const relay = { fetch: vi.fn().mockResolvedValue(geminiOk()) };

    const res = await callGemini("secret-key", "gemini-2.5-flash", '{"a":1}', {
      relay,
    });

    expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe("ok");
    expect(globalFetch).not.toHaveBeenCalled();
    expect(relay.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = relay.fetch.mock.calls[0];
    // 中継は URL のパスだけを見て generativelanguage.googleapis.com に送る
    expect(new URL(url).pathname).toBe(
      "/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(url).not.toContain("secret-key");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("secret-key");
    expect(init.body).toBe('{"a":1}');
  });

  it("relay 経由でも 5xx は backoff のあと relay で再送する", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("global fetch must not be used"),
    );
    const relay = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(geminiOk()),
    };

    const promise = callGemini("k", "gemini-2.5-flash", "{}", {
      maxAttempts: 2,
      relay,
    });
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    expect(relay.fetch).toHaveBeenCalledTimes(2);
  });
});
