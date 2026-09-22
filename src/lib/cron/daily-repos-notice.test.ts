import { describe, expect, it } from "vitest";
import { buildDailyReposNotice } from "./daily-repos-notice";

const base = {
  count: 14,
  durationMs: 177700,
  summary: "daily-repos: 14件 / 177.7s",
};

describe("buildDailyReposNotice (翻訳できず翌日に回した件数)", () => {
  it("skipped が 0 なら本文に何も足さない", () => {
    const n = buildDailyReposNotice({
      ...base,
      postFailed: null,
      geminiWarning: null,
      skipped: [],
    });
    expect(n.summary).toBe("daily-repos: 14件 / 177.7s");
    expect(n.severity).toBe("info");
  });

  it("skipped があれば warning にして件数とリポ名を本文に載せる", () => {
    const n = buildDailyReposNotice({
      ...base,
      postFailed: null,
      geminiWarning: null,
      skipped: ["owner/a", "owner/b"],
    });
    expect(n.severity).toBe("warning");
    expect(n.subject).toBe(
      "⚠️ shirankedo daily-repos 完了(翻訳失敗 2 件は翌日に再試行) (14件 / 177.7s)",
    );
    expect(n.summary).toBe(
      "daily-repos: 14件 / 177.7s | 翻訳できず翌日に再試行: 2 件 (owner/a, owner/b)",
    );
  });

  it("skipped が多い場合はリポ名を 5 件までにして残りは件数で示す", () => {
    const skipped = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"];
    const n = buildDailyReposNotice({
      ...base,
      postFailed: null,
      geminiWarning: null,
      skipped,
    });
    expect(n.summary).toBe(
      "daily-repos: 14件 / 177.7s | 翻訳できず翌日に再試行: 7 件 (r1, r2, r3, r4, r5 他 2 件)",
    );
  });
});

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
