import { afterEach, describe, expect, it, vi } from "vitest";
import { callGemini, type GeminiEnv } from "./cron-shared";

const RELAY_URL =
  "https://gemini-relay/v1beta/models/gemini-2.5-flash:generateContent";

const geminiOk = () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

/** gemini-relay の偽物を持つ env。Gemini はこの fetch 経由でだけ呼ばれる */
function relayEnv() {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  const env: GeminiEnv = { GEMINI_API_KEY: "k", GEMINI_RELAY: { fetch } };
  return { env, fetch };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("callGemini", () => {
  it("中継の fetch でだけ送り、キーは URL ではなく x-goog-api-key ヘッダで送る", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const { env, fetch } = relayEnv();
    fetch.mockResolvedValue(geminiOk());

    const res = await callGemini(env, "gemini-2.5-flash", '{"a":1}');

    expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe("ok");
    expect(globalFetch).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      RELAY_URL,
      expect.objectContaining({ method: "POST", body: '{"a":1}' }),
    );
    expect(
      new Headers(fetch.mock.calls[0][1]?.headers).get("x-goog-api-key"),
    ).toBe("k");
  });

  it("GEMINI_RELAY が無ければ送らずに throw する (香港から直接呼ぶ経路に黙って戻らない)", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const env = { GEMINI_API_KEY: "k" } as unknown as GeminiEnv;

    await expect(callGemini(env, "m", "{}")).rejects.toThrow(/GEMINI_RELAY/);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("中継の応答の cf-placement を毎回ログに残す", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { env, fetch } = relayEnv();
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { "cf-placement": "remote-IAD" },
      }),
    );

    await callGemini(env, "gemini-2.5-flash", "{}");

    const lines = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('"gemini_relay"'));
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        type: "gemini_relay",
        model: "gemini-2.5-flash",
        status: 200,
        placement: "remote-IAD",
      },
    ]);
  });

  it("524 のあと backoff 経過後に再送し、2 回目の 200 を返す", async () => {
    // Given: 1 回目は Cloudflare の 524、2 回目は成功
    vi.useFakeTimers();
    const { env, fetch } = relayEnv();
    fetch
      .mockResolvedValueOnce(new Response("error code: 524", { status: 524 }))
      .mockResolvedValueOnce(geminiOk());

    // When
    const promise = callGemini(env, "gemini-2.5-flash", "{}", {
      maxAttempts: 2,
      backoffMs: 10000,
    });

    // Then: backoff が終わるまでは再送しない
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const res = await promise;
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      RELAY_URL,
      RELAY_URL,
    ]);
    expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe("ok");
  });

  it("オプション未指定なら再試行せず、従来どおりの形式で throw する", async () => {
    const { env, fetch } = relayEnv();
    fetch.mockResolvedValue(new Response("error code: 524", { status: 524 }));

    await expect(callGemini(env, "gemini-2.5-flash", "{}")).rejects.toThrow(
      "Gemini gemini-2.5-flash HTTP 524: error code: 524",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("オプション未指定で fetch 自体が失敗したら、元の例外をそのまま投げる", async () => {
    const original = new Error("network down");
    const { env, fetch } = relayEnv();
    fetch.mockRejectedValue(original);

    await expect(callGemini(env, "m", "{}")).rejects.toBe(original);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("400 は再試行対象外で即 throw する", async () => {
    const { env, fetch } = relayEnv();
    fetch.mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(
      callGemini(env, "m", "{}", { maxAttempts: 2, backoffMs: 10 }),
    ).rejects.toThrow("Gemini m HTTP 400: bad request");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("429 は再試行して成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { env, fetch } = relayEnv();
    fetch
      .mockResolvedValueOnce(new Response("quota", { status: 429 }))
      .mockResolvedValueOnce(geminiOk());

    await callGemini(env, "m", "{}", { maxAttempts: 2, backoffMs: 10 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("5xx が最後まで続けば最後のステータスで throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { env, fetch } = relayEnv();
    // Response の本文は 1 回しか読めないので呼び出しごとに作る
    fetch.mockImplementation(
      async () => new Response("unavailable", { status: 503 }),
    );

    await expect(
      callGemini(env, "m", "{}", { maxAttempts: 2, backoffMs: 10 }),
    ).rejects.toThrow("Gemini m HTTP 503: unavailable (after 2 attempts)");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fetch 自体の失敗 (タイムアウト等) も再試行し、尽きたら throw する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { env, fetch } = relayEnv();
    fetch.mockRejectedValue(
      new Error("The operation was aborted due to timeout"),
    );

    await expect(
      callGemini(env, "m", "{}", { maxAttempts: 2, backoffMs: 10 }),
    ).rejects.toThrow(/Gemini m fetch failed \(after 2 attempts\): .*timeout/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
