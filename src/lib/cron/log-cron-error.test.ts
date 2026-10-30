import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logCronError } from "./log-cron-error";
import { fakeObsBinding } from "./test-obs-binding";

describe("logCronError", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let globalFetch: ReturnType<typeof vi.spyOn>;

  function makeCtx() {
    const promises: Promise<unknown>[] = [];
    return {
      promises,
      waitUntil: (p: Promise<unknown>) => {
        promises.push(p);
      },
    };
  }

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Worker から別 Worker の workers.dev URL は叩けない (error 1042) ので、グローバル fetch は使われない前提
    globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("global fetch must not be used"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("type:cron_failed の構造化ログを必ず残す", () => {
    const ctx = makeCtx();
    logCronError("daily-articles", new Error("NVD 429"), {}, ctx);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logged.type).toBe("cron_failed");
    expect(logged.cron).toBe("daily-articles");
    expect(logged.error).toContain("NVD 429");
    expect(logged.stack).toBeTruthy();
  });

  it("N8N_WEBHOOK_SECRET 未設定なら obs-notify を呼ばない", async () => {
    const ctx = makeCtx();
    const obs = fakeObsBinding();
    logCronError("daily-vulns", new Error("oops"), { OBS: obs.binding }, ctx);
    await Promise.all(ctx.promises);

    expect(obs.fetch).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("N8N_WEBHOOK_SECRET 設定ありなら Service binding で obs-notify に warning を POST", async () => {
    const ctx = makeCtx();
    const obs = fakeObsBinding();
    logCronError(
      "daily-repos",
      new Error("GitHub GraphQL HTTP 502"),
      { N8N_WEBHOOK_SECRET: "test-secret", OBS: obs.binding },
      ctx,
    );
    await Promise.all(ctx.promises);

    expect(globalFetch).not.toHaveBeenCalled();
    expect(obs.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = obs.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/obs-notify");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Webhook-Secret"]).toBe("test-secret");
    const body = JSON.parse(String(init?.body));
    expect(body.severity).toBe("warning");
    expect(body.subject).toContain("daily-repos");
    expect(body.summary).toContain("GitHub GraphQL HTTP 502");
    expect(body.raw_payload.cron).toBe("daily-repos");
    expect(body.service).toBe("cf-worker");
    expect(body.repo).toBe("shirankedo");
  });

  it("binding が無くても落ちず、構造化ログは残る", async () => {
    const ctx = makeCtx();
    logCronError(
      "daily-stars",
      new Error("boom"),
      { N8N_WEBHOOK_SECRET: "test-secret" },
      ctx,
    );
    await expect(Promise.all(ctx.promises)).resolves.toBeDefined();

    expect(globalFetch).not.toHaveBeenCalled();
    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logged.type).toBe("cron_failed");
  });

  it("Error 以外 (string 等) を投げても落ちず構造化ログは残す", () => {
    const ctx = makeCtx();
    logCronError("daily-stars", "plain string error", {}, ctx);

    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logged.error).toBe("plain string error");
    expect(logged.stack).toBeUndefined();
  });
});
