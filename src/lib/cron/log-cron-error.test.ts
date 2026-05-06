import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logCronError } from "./log-cron-error";

describe("logCronError", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

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
    fetchMock = vi.fn(async () => new Response("", { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.unstubAllGlobals();
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
    logCronError("daily-vulns", new Error("oops"), {}, ctx);
    await Promise.all(ctx.promises);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("N8N_WEBHOOK_SECRET 設定ありなら obs-notify に warning を POST", async () => {
    const ctx = makeCtx();
    logCronError(
      "daily-repos",
      new Error("GitHub GraphQL HTTP 502"),
      { N8N_WEBHOOK_SECRET: "test-secret" },
      ctx,
    );
    await Promise.all(ctx.promises);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("obs-notify");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Webhook-Secret"]).toBe("test-secret");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.severity).toBe("warning");
    expect(body.subject).toContain("daily-repos");
    expect(body.summary).toContain("GitHub GraphQL HTTP 502");
    expect(body.raw_payload.cron).toBe("daily-repos");
    expect(body.service).toBe("cf-worker");
    expect(body.repo).toBe("shirankedo");
  });

  it("Error 以外 (string 等) を投げても落ちず構造化ログは残す", () => {
    const ctx = makeCtx();
    logCronError("daily-stars", "plain string error", {}, ctx);

    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(logged.error).toBe("plain string error");
    expect(logged.stack).toBeUndefined();
  });
});
