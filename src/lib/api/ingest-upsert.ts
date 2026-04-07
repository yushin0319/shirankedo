// UPSERT 系のロジック（vulnerabilities, releases, tracking-repos）
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import { releases, trackingRepos, vulnerabilities } from "../../db/schema";
import {
  releaseSchema,
  repoRenameSchema,
  trackingRepoSchema,
  vulnerabilitySchema,
} from "./schemas";

/** vulnerabilities: UPSERT（cvssScore 更新あり） */
export async function processVulnerabilities(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0 };
  const parsed = z.array(vulnerabilitySchema).parse(data);

  const cveIds = parsed.map((v) => v.cveId);
  const existing = await db
    .select({ cveId: vulnerabilities.cveId })
    .from(vulnerabilities)
    .where(inArray(vulnerabilities.cveId, cveIds));
  const existingSet = new Set(existing.map((r) => r.cveId));

  let inserted = 0;
  let updated = 0;

  for (const item of parsed) {
    if (existingSet.has(item.cveId)) {
      await db
        .update(vulnerabilities)
        .set({
          title: item.title,
          cvssScore: item.cvssScore,
          publishedAt: item.publishedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(vulnerabilities.cveId, item.cveId));
      updated++;
    } else {
      await db.insert(vulnerabilities).values(item);
      inserted++;
    }
  }
  return { inserted, updated };
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
  const existing = await db
    .select({ repo: releases.repo, tag: releases.tag })
    .from(releases)
    .where(inArray(releases.repo, repos));
  const existingKeys = new Set(existing.map((r) => `${r.repo}:${r.tag}`));

  const newItems = parsed.filter(
    (r) => !existingKeys.has(`${r.repo}:${r.tag}`),
  );
  if (newItems.length === 0) return { inserted: 0 };

  for (const item of newItems) {
    await db.insert(releases).values(item);
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
  const existing = await db
    .select({ repo: trackingRepos.repo })
    .from(trackingRepos)
    .where(inArray(trackingRepos.repo, repoNames));
  const existingSet = new Set(existing.map((r) => r.repo));

  let inserted = 0;
  let updated = 0;

  for (const item of parsed) {
    if (existingSet.has(item.repo)) {
      await db
        .update(trackingRepos)
        .set({
          displayName: item.displayName,
          description: item.description,
          language: item.language,
          publishedAt: item.publishedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(trackingRepos.repo, item.repo));
      updated++;
    } else {
      await db.insert(trackingRepos).values(item);
      inserted++;
    }
  }
  return { inserted, updated };
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
    const toExists = await db
      .select({ repo: trackingRepos.repo })
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, to));
    if (toExists.length === 0) continue;

    // from が tracking_repos に存在するか確認
    const fromExists = await db
      .select({ repo: trackingRepos.repo })
      .from(trackingRepos)
      .where(eq(trackingRepos.repo, from));
    if (fromExists.length === 0) continue;

    // from を tracking_repos から DELETE
    await db.delete(trackingRepos).where(eq(trackingRepos.repo, from));
    deleted++;
  }

  return { deleted };
}

/** tracking-repos: GET 一覧 */
export async function getTrackingRepos(
  db: AppDatabase,
): Promise<(typeof trackingRepos.$inferSelect)[]> {
  return db.select().from(trackingRepos);
}
