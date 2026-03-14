import { describe, expect, it } from "vitest";
import { isNewRepo } from "./trend";

describe("isNewRepo", () => {
  it("published_at が7日以内の場合、trueを返す", () => {
    const now = new Date("2026-03-13");
    expect(isNewRepo("2026-03-10", now)).toBe(true);
    expect(isNewRepo("2026-03-07", now)).toBe(true); // ちょうど6日前
  });

  it("published_at が7日より前の場合、falseを返す", () => {
    const now = new Date("2026-03-13");
    expect(isNewRepo("2026-03-05", now)).toBe(false); // 8日前
    expect(isNewRepo("2026-01-01", now)).toBe(false);
  });

  it("published_at が null/undefined の場合、falseを返す", () => {
    const now = new Date("2026-03-13");
    expect(isNewRepo(null, now)).toBe(false);
    expect(isNewRepo(undefined, now)).toBe(false);
  });
});
