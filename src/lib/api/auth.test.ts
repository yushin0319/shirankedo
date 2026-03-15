import { describe, expect, it } from "vitest";
import { jsonError, jsonOk, verifyApiKey } from "./auth";

describe("verifyApiKey", () => {
  it("正しいAPIキーで true を返す", () => {
    const request = new Request("http://localhost", {
      headers: { "X-API-Key": "test-secret-key" },
    });
    expect(verifyApiKey(request, "test-secret-key")).toBe(true);
  });

  it("不正なAPIキーで false を返す", () => {
    const request = new Request("http://localhost", {
      headers: { "X-API-Key": "wrong-key" },
    });
    expect(verifyApiKey(request, "test-secret-key")).toBe(false);
  });

  it("ヘッダーなしで false を返す", () => {
    const request = new Request("http://localhost");
    expect(verifyApiKey(request, "test-secret-key")).toBe(false);
  });
});

describe("jsonOk", () => {
  it("200 + ok:true のレスポンスを返す", async () => {
    const res = jsonOk({ inserted: 5 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, inserted: 5 });
  });
});

describe("jsonError", () => {
  it("指定ステータス + ok:false のレスポンスを返す", async () => {
    const res = jsonError(401, "Unauthorized");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("details を含めることができる", async () => {
    const res = jsonError(400, "Validation failed", [{ field: "url" }]);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "Validation failed",
      details: [{ field: "url" }],
    });
  });
});
