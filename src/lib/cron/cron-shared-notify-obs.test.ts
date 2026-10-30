import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyObs, type ServiceBinding } from "./cron-shared";

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeBinding(
  impl: (input: string, init?: RequestInit) => Promise<Response>,
) {
  const fetch = vi.fn(impl);
  return { binding: { fetch } satisfies ServiceBinding, fetch };
}

describe("notifyObs", () => {
  it("Service binding の fetch で /obs-notify に POST し、グローバル fetch は使わない", async () => {
    // Given: observability-tail が 200 を返す binding
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("global fetch must not be used"));
    const { binding, fetch } = fakeBinding(
      async () => new Response("{}", { status: 200 }),
    );

    // When
    const r = await notifyObs(binding, "test-secret", {
      severity: "info",
      subject: "✅ done",
      summary: "ok",
    });

    // Then
    expect(r).toEqual({ ok: true });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/obs-notify");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Webhook-Secret"]).toBe("test-secret");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      severity: "info",
      subject: "✅ done",
      summary: "ok",
      service: "cf-worker",
      repo: "shirankedo",
    });
  });

  it("observability-tail が 2xx 以外を返したら ok:false と HTTP ステータスを返す", async () => {
    const { binding } = fakeBinding(
      async () => new Response(null, { status: 403 }),
    );

    const r = await notifyObs(binding, "wrong", {
      severity: "warning",
      subject: "x",
    });

    expect(r).toEqual({ ok: false, error: "HTTP 403" });
  });

  it("binding の fetch が例外を投げても throw せず ok:false を返す", async () => {
    const { binding } = fakeBinding(async () => {
      throw new Error("service unavailable");
    });

    const r = await notifyObs(binding, "s", {
      severity: "warning",
      subject: "x",
    });

    expect(r.ok).toBe(false);
    expect(r.error).toContain("service unavailable");
  });

  it("binding が無い環境では送らず、throw もしない", async () => {
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("global fetch must not be used"));

    const r = await notifyObs(undefined, "s", {
      severity: "warning",
      subject: "x",
    });

    expect(r.ok).toBe(false);
    expect(r.error).toContain("OBS");
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
