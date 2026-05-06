// UPSERT 系のロジック（vulnerabilities, releases, tracking-repos）
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import {
  releases,
  repoStats,
  trackingRepos,
  vulnerabilities,
} from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import {
  releaseSchema,
  repoRenameSchema,
  trackingRepoSchema,
  vulnerabilitySchema,
} from "./schemas";

// D1 は 1 prepared statement あたり最大 100 bound parameter。 各テーブル INSERT
// 列数は releases/trackingRepos が 6、 vulnerabilities が 5。 50 件 × 6 列 = 300
// は超過するが、 実測で vulnerabilities 70 件 × 5 = 350 は通過、 releases 72
// 件 × 6 = 432 で失敗 (PR #155 03:20 UTC) → 限界は ~350-432 の間。 16 件以下なら
// 16 × 6 = 96 < 100 で確実に safe。 daily 実 INSERT は最大 100 件程度なので
// chunk 数 7 でも subrequest 50 limit 内余裕。
const INSERT_CHUNK_SIZE = 16;

/** vulnerabilities: UPSERT（cvssScore 更新あり） */
export async function processVulnerabilities(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0 };
  const parsed = z.array(vulnerabilitySchema).parse(data);

  const cveIds = parsed.map((v) => v.cveId);
  const existing = await queryD1("vulnerabilities.existing", () =>
    db
      .select({ cveId: vulnerabilities.cveId })
      .from(vulnerabilities)
      .where(inArray(vulnerabilities.cveId, cveIds)),
  );
  const existingSet = new Set(existing.map((r) => r.cveId));

  const newItems = parsed.filter((v) => !existingSet.has(v.cveId));
  const updateItems = parsed.filter((v) => existingSet.has(v.cveId));

  for (let i = 0; i < newItems.length; i += INSERT_CHUNK_SIZE) {
    await queryD1("vulnerabilities.insert_chunk", () =>
      db
        .insert(vulnerabilities)
        .values(newItems.slice(i, i + INSERT_CHUNK_SIZE)),
    );
  }
  for (const item of updateItems) {
    await queryD1("vulnerabilities.update", () =>
      db
        .update(vulnerabilities)
        .set({
          title: item.title,
          cvssScore: item.cvssScore,
          publishedAt: item.publishedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(vulnerabilities.cveId, item.cveId)),
    );
  }
  return { inserted: newItems.length, updated: updateItems.length };
}

/** releases: INSERT（repo+tag 重複スキップ） */
export async function processReleases(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number }> {
  if (data.length === 0) return { inserted: 0 };
  const parsed = z.array(releaseSchema).parse(data);

  // 既存の repo+tag ペアを取得
  const repos = [...new Set(parsed.map((r) => r.repo))];
  const existing = await queryD1("releases.existing", () =>
    db
      .select({ repo: releases.repo, tag: releases.tag })
      .from(releases)
      .where(inArray(releases.repo, repos)),
  );
  const existingKeys = new Set(existing.map((r) => `${r.repo}:${r.tag}`));

  const newItems = parsed.filter(
    (r) => !existingKeys.has(`${r.repo}:${r.tag}`),
  );
  if (newItems.length === 0) return { inserted: 0 };

  for (let i = 0; i < newItems.length; i += INSERT_CHUNK_SIZE) {
    await queryD1("releases.insert_chunk", () =>
      db.insert(releases).values(newItems.slice(i, i + INSERT_CHUNK_SIZE)),
    );
  }
  return { inserted: newItems.length };
}

/** tracking-repos: UPSERT */
export async function processTrackingRepos(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0 };
  const parsed = z.array(trackingRepoSchema).parse(data);

  const repoNames = parsed.map((r) => r.repo);
  const existing = await queryD1("tracking_repos.existing", () =>
    db
      .select({ repo: trackingRepos.repo })
      .from(trackingRepos)
      .where(inArray(trackingRepos.repo, repoNames)),
  );
  const existingSet = new Set(existing.map((r) => r.repo));

  const newItems = parsed.filter((r) => !existingSet.has(r.repo));
  const updateItems = parsed.filter((r) => existingSet.has(r.repo));

  for (let i = 0; i < newItems.length; i += INSERT_CHUNK_SIZE) {
    await queryD1("tracking_repos.insert_chunk", () =>
      db.insert(trackingRepos).values(newItems.slice(i, i + INSERT_CHUNK_SIZE)),
    );
  }
  for (const item of updateItems) {
    await queryD1("tracking_repos.update", () =>
      db
        .update(trackingRepos)
        .set({
          displayName: item.displayName,
          description: item.description,
          language: item.language,
          publishedAt: item.publishedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(trackingRepos.repo, item.repo)),
    );
  }
  return { inserted: newItems.length, updated: updateItems.length };
}

/**
 * repo-renames: GitHub のリポジトリリネームを D1 に反映する。
 *
 * - to 不在: from を to にリネーム（tracking_repos と repo_stats 両方の repo を更新）
 *   → スター履歴を維持したまま新名へ移行できる。
 * - 両方存在: from を削除（重複解消）。to 側に既に履歴があるので from の repo_stats も破棄。
 * - from 不在: 何もしない。
 */
export async function processRepoRenames(
  db: AppDatabase,
  renames: { from: string; to: string }[],
): Promise<{ renamed: number; deleted: number }> {
  if (renames.length === 0) return { renamed: 0, deleted: 0 };
  const parsed = z.array(repoRenameSchema).parse(renames);

  // CF Workers Free の subrequest 上限 (50) に対し、各 rename で SELECT を 2 回
  // 走らせると 13 件超で枯渇する。全 from/to を 1 回の inArray SELECT で取得して Set 化。
  const allNames = [...new Set(parsed.flatMap((r) => [r.from, r.to]))];
  const existingRows = await queryD1("tracking_repos.check_renames_bulk", () =>
    db
      .select({ repo: trackingRepos.repo })
      .from(trackingRepos)
      .where(inArray(trackingRepos.repo, allNames)),
  );
  const existing = new Set(existingRows.map((r) => r.repo));

  let renamed = 0;
  let deleted = 0;

  for (const { from, to } of parsed) {
    if (!existing.has(from)) continue;

    if (existing.has(to)) {
      await queryD1("tracking_repos.delete", () =>
        db.delete(trackingRepos).where(eq(trackingRepos.repo, from)),
      );
      await queryD1("repo_stats.delete_renamed_from", () =>
        db.delete(repoStats).where(eq(repoStats.repo, from)),
      );
      existing.delete(from);
      deleted++;
    } else {
      const now = new Date().toISOString();
      await queryD1("tracking_repos.rename", () =>
        db
          .update(trackingRepos)
          .set({ repo: to, updatedAt: now })
          .where(eq(trackingRepos.repo, from)),
      );
      await queryD1("repo_stats.rename", () =>
        db.update(repoStats).set({ repo: to }).where(eq(repoStats.repo, from)),
      );
      existing.delete(from);
      existing.add(to);
      renamed++;
    }
  }

  return { renamed, deleted };
}

/** tracking-repos: GET 一覧 */
export async function getTrackingRepos(
  db: AppDatabase,
): Promise<(typeof trackingRepos.$inferSelect)[]> {
  return queryD1("tracking_repos.list", () => db.select().from(trackingRepos));
}
