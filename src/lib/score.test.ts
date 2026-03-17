import { afterEach, describe, expect, it, vi } from "vitest";
import { articleDecayScore, releaseDecayScore, vulnDecayScore } from "./score";

const DECAY = 0.85;

describe("articleDecayScore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("当日の記事はimpactそのまま", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(articleDecayScore(8, "2026-03-15")).toBeCloseTo(8);
  });

  it("1日経過で0.85倍", () => {
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
    expect(articleDecayScore(10, "2026-03-15")).toBeCloseTo(10 * DECAY);
  });

  it("3日経過で0.85^3倍", () => {
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
    expect(articleDecayScore(5, "2026-03-15")).toBeCloseTo(5 * DECAY ** 3);
  });

  it("高impactは低impactより数日後でも上位", () => {
    vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));
    const high = articleDecayScore(10, "2026-03-15"); // 2日前、impact10
    const low = articleDecayScore(3, "2026-03-17"); // 当日、impact3
    expect(high).toBeGreaterThan(low);
  });

  it("nowを明示的に渡せる", () => {
    const now = new Date("2026-03-16T12:00:00Z");
    expect(articleDecayScore(10, "2026-03-15", now)).toBeCloseTo(10 * DECAY);
  });
});

describe("vulnDecayScore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("当日の脆弱性はcvssScoreそのまま", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(vulnDecayScore(9.8, "2026-03-15")).toBeCloseTo(9.8);
  });

  it("2日経過で0.85^2倍", () => {
    vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));
    expect(vulnDecayScore(9.0, "2026-03-15")).toBeCloseTo(9.0 * DECAY ** 2);
  });

  it("cvssScoreがnullなら0を返す", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(vulnDecayScore(null, "2026-03-15")).toBe(0);
  });
});

describe("releaseDecayScore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("当日のmajorリリースはstars×2", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(releaseDecayScore(1000, "major", "2026-03-15")).toBeCloseTo(2000);
  });

  it("当日のminorリリースはstars×1", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(releaseDecayScore(1000, "minor", "2026-03-15")).toBeCloseTo(1000);
  });

  it("1日経過のmajorはstars×2×0.85", () => {
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
    expect(releaseDecayScore(500, "major", "2026-03-15")).toBeCloseTo(
      500 * 2 * DECAY,
    );
  });

  it("starsが0なら0を返す", () => {
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(releaseDecayScore(0, "major", "2026-03-15")).toBe(0);
  });
});
