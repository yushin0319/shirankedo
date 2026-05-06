import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { trackingRepos } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { applyRenames } from "./daily-stars";

describe("applyRenames", () => {
  it("dry-run なら何も UPDATE せず全件 skipped", async () => {
    const { db } = createTestDbWithTables();
    await db
      .insert(trackingRepos)
      .values({ repo: "old/foo", displayName: "foo" });

    const result = await applyRenames(
      db,
      [{ from: "old/foo", to: "new/foo" }],
      true,
    );
    expect(result).toEqual({ applied: 0, skipped: 1, errors: 0 });

    const rows = await db
      .select()
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, "old/foo"));
    expect(rows).toHaveLength(1);
  });

  it("空配列なら applied=0 / skipped=0", async () => {
    const { db } = createTestDbWithTables();
    const result = await applyRenames(db, [], false);
    expect(result).toEqual({ applied: 0, skipped: 0, errors: 0 });
  });

  it("通常の rename: 旧名 row が新名に UPDATE される", async () => {
    const { db } = createTestDbWithTables();
    await db
      .insert(trackingRepos)
      .values({ repo: "ForLoopCodes/contextplus", displayName: "contextplus" });

    const result = await applyRenames(
      db,
      [{ from: "ForLoopCodes/contextplus", to: "forloopcodes/contextplus" }],
      false,
    );
    expect(result).toEqual({ applied: 1, skipped: 0, errors: 0 });

    const oldRow = await db
      .select()
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, "ForLoopCodes/contextplus"));
    expect(oldRow).toHaveLength(0);

    const newRow = await db
      .select()
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, "forloopcodes/contextplus"));
    expect(newRow).toHaveLength(1);
  });

  it("from === to なら skipped 扱い (no-op)", async () => {
    const { db } = createTestDbWithTables();
    await db
      .insert(trackingRepos)
      .values({ repo: "same/repo", displayName: "repo" });

    const result = await applyRenames(
      db,
      [{ from: "same/repo", to: "same/repo" }],
      false,
    );
    expect(result).toEqual({ applied: 0, skipped: 1, errors: 0 });
  });

  it("UNIQUE 衝突 (新名 row が既存) なら旧名 row を孤児として削除し applied 扱い", async () => {
    const { db } = createTestDbWithTables();
    // 旧名 + 新名の両方が tracking_repos に存在するケース
    // GitHub 側で rename を merged 済みの状態
    await db
      .insert(trackingRepos)
      .values({ repo: "old/conflict", displayName: "conflict-old" });
    await db
      .insert(trackingRepos)
      .values({ repo: "new/conflict", displayName: "conflict-new" });

    const result = await applyRenames(
      db,
      [{ from: "old/conflict", to: "new/conflict" }],
      false,
    );
    expect(result).toEqual({ applied: 1, skipped: 0, errors: 0 });

    const oldRow = await db
      .select()
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, "old/conflict"));
    expect(oldRow).toHaveLength(0);

    const newRow = await db
      .select()
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, "new/conflict"));
    expect(newRow).toHaveLength(1);
  });

  it("複数 rename の混在: applied + skipped が正しくカウントされる", async () => {
    const { db } = createTestDbWithTables();
    await db.insert(trackingRepos).values([
      { repo: "a/old1", displayName: "old1" },
      { repo: "b/old2", displayName: "old2" },
      { repo: "c/same", displayName: "same" },
    ]);

    const result = await applyRenames(
      db,
      [
        { from: "a/old1", to: "a/new1" }, // 通常 rename
        { from: "b/old2", to: "b/new2" }, // 通常 rename
        { from: "c/same", to: "c/same" }, // no-op
      ],
      false,
    );
    expect(result).toEqual({ applied: 2, skipped: 1, errors: 0 });

    const all = await db.select().from(trackingRepos);
    const repos = all.map((r) => r.repo).sort();
    expect(repos).toEqual(["a/new1", "b/new2", "c/same"]);
  });
});
