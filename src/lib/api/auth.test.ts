import { describe, expect, it } from "vitest";
import {
  handleApiError,
  jsonError,
  jsonOk,
  safeJsonParse,
  verifyApiKey,
} from "./auth";

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

  it("内部情報を含めない（detailsフィールドなし）", async () => {
    const res = jsonError(400, "Validation failed");
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Validation failed" });
    expect(body).not.toHaveProperty("details");
  });
});

describe("safeJsonParse", () => {
  it("正常なJSONをパースできる", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(request);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ key: "value" });
  });

  it("不正なJSONで400エラーを返す", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJsonParse(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe("Invalid JSON");
    }
  });
});

describe("handleApiError", () => {
  it("ZodErrorで400を返す", async () => {
    const error = new Error("validation");
    error.name = "ZodError";
    const res = handleApiError(error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Validation failed" });
  });

  it("一般エラーで500を返し、内部メッセージを隠蔽する", async () => {
    const res = handleApiError(new Error("SQL syntax error near..."));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Internal error" });
  });
});
