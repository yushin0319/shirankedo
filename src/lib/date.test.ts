import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDisplayDate, formatRelativeDate, isToday } from "./date";

describe("formatRelativeDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const cases = [
    {
      name: "数秒前なら「たった今」を返す",
      nowIso: "2026-03-13T12:00:00Z",
      inputIso: "2026-03-13T11:59:50Z",
      expected: "たった今",
    },
    {
      name: "30分前なら「30分前」を返す",
      nowIso: "2026-03-13T12:00:00Z",
      inputIso: "2026-03-13T11:30:00Z",
      expected: "30分前",
    },
    {
      name: "3時間前なら「3時間前」を返す",
      nowIso: "2026-03-13T15:00:00Z",
      inputIso: "2026-03-13T12:00:00Z",
      expected: "3時間前",
    },
    {
      name: "2日前なら「2日前」を返す",
      nowIso: "2026-03-13T12:00:00Z",
      inputIso: "2026-03-11T12:00:00Z",
      expected: "2日前",
    },
    {
      name: "8日以上前なら生の日付文字列を返す",
      nowIso: "2026-03-13T12:00:00Z",
      inputIso: "2026-03-01T12:00:00Z",
      expected: "2026-03-01",
    },
  ];

  it.each(cases)("$name", ({ nowIso, inputIso, expected }) => {
    vi.setSystemTime(new Date(nowIso));
    expect(formatRelativeDate(inputIso)).toBe(expected);
  });
});

describe("formatDisplayDate", () => {
  it("日付文字列をYYYY / MM / DD形式に変換する", () => {
    expect(formatDisplayDate("2026-03-13")).toBe("2026 / 03 / 13");
  });

  it("1桁の月日もゼロ埋めで表示する", () => {
    expect(formatDisplayDate("2026-01-05")).toBe("2026 / 01 / 05");
  });
});

describe("isToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("今日の日付ならtrueを返す", () => {
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
    expect(isToday("2026-03-13")).toBe(true);
  });

  it("昨日の日付ならfalseを返す", () => {
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
    expect(isToday("2026-03-12")).toBe(false);
  });
});
