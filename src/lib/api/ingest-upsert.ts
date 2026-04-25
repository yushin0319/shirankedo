// UPSERT 系のロジック（vulnerabilities, releases, tracking-repos）
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import { releases, trackingRepos, vulnerabilities } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import {
  releaseSchema,
  repoRenameSchema,
  trackingRepoSchema,
  vulnerabilitySchema,
} from "./schemas";

// D1 は 1 prepared statement あたり最大 100 bound parameter。
// 各テーブルの INSERT 列数（5 列前後）に対し余裕を持たせて 20 行ずつに分割する。
// また CF Workers Free の subrequest 上限（50）に対し、50 行以上のループ INSERT で
// 枯渇するため、bulk INSERT + chunk で subrequest 数を大幅に削減する。
const INSERT_CHUNK_SIZE = 20;

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

/** repo-renames: 旧名の tracking_repos レコードを削除 */
export async function processRepoRenames(
  db: AppDatabase,
  renames: { from: string; to: string }[],
): Promise<{ deleted: number }> {
  if (renames.length === 0) return { deleted: 0 };
  const parsed = z.array(repoRenameSchema).parse(renames);

  let deleted = 0;

  for (const { from, to } of parsed) {
    // to が tracking_repos に存在するか確認（存在しなければ skip）
    const toExists = await queryD1("tracking_repos.check_to", () =>
      db
        .select({ repo: trackingRepos.repo })
        .from(trackingRepos)
        .where(eq(trackingRepos.repo, to)),
    );
    if (toExists.length === 0) continue;

    // from が tracking_repos に存在するか確認
    const fromExists = await queryD1("tracking_repos.check_from", () =>
      db
        .select({ repo: trackingRepos.repo })
        .from(trackingRepos)
        .where(eq(trackingRepos.repo, from)),
    );
    if (fromExists.length === 0) continue;

    // from を tracking_repos から DELETE
    await queryD1("tracking_repos.delete", () =>
      db.delete(trackingRepos).where(eq(trackingRepos.repo, from)),
    );
    deleted++;
  }

  return { deleted };
}

/** tracking-repos: GET 一覧 */
export async function getTrackingRepos(
  db: AppDatabase,
): Promise<(typeof trackingRepos.$inferSelect)[]> {
  return queryD1("tracking_repos.list", () => db.select().from(trackingRepos));
}
