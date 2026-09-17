import { describe, expect, it } from "vitest";
import { buildDailyReposNotice } from "./daily-repos-notice";

const base = {
  count: 14,
  durationMs: 177700,
  summary: "daily-repos: 14件 / 177.7s",
};

describe("buildDailyReposNotice", () => {
  it("失敗がなければ info で ✅ の件名、本文はサマリーのまま", () => {
    const n = buildDailyReposNotice({
      ...base,
      postFailed: null,
      geminiWarning: null,
    });
    expect(n).toEqual({
      severity: "info",
      subject: "✅ shirankedo daily-repos 完了 (14件 / 177.7s)",
      summary: "daily-repos: 14件 / 177.7s",
    });
  });

  it("AI 翻訳が失敗したら warning で、本文に失敗理由を載せる", () => {
    const n = buildDailyReposNotice({
      ...base,
      postFailed: null,
      geminiWarning: "Error: Gemini gemini-2.5-flash HTTP 524: error code: 524",
    });
    expect(n.severity).toBe("warning");
    expect(n.subject).toBe(
      "⚠️ shirankedo daily-repos 完了(AI翻訳失敗) (14件 / 177.7s)",
    );
    expect(n.summary).toBe(
      "daily-repos: 14件 / 177.7s | AI翻訳失敗: Error: Gemini gemini-2.5-flash HTTP 524: error code: 524",
    );
  });

  it("失敗理由が長い場合は 200 文字で切る", () => {
    const n = buildDailyReposNotice({
      ...base,
      postFailed: null,
      geminiWarning: "x".repeat(500),
    });
    expect(n.summary).toBe(
      `daily-repos: 14件 / 177.7s | AI翻訳失敗: ${"x".repeat(200)}`,
    );
  });

  it("DB 書き込み失敗が優先され、翻訳失敗も同時にあれば本文に両方載せる", () => {
    const n = buildDailyReposNotice({
      ...base,
      postFailed: "repo-stats: D1_ERROR",
      geminiWarning: "Error: Gemini m HTTP 503: x",
    });
    expect(n.severity).toBe("warning");
    expect(n.subject).toBe(
      "❌ shirankedo daily-repos DB書込失敗 (14件 / 177.7s)",
    );
    expect(n.summary).toBe(
      "daily-repos: 14件 / 177.7s | DB書込失敗: repo-stats: D1_ERROR | AI翻訳失敗: Error: Gemini m HTTP 503: x",
    );
  });
});
