// シンプル INSERT 系のロジック（repo-stats, page-comments）

import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import { pageComments, repoStats } from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { pageCommentSchema, repoStatSchema } from "./schemas";

/** repo-stats: Star 週次スナップショット INSERT */
export async function processRepoStats(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number }> {
  if (data.length === 0) return { inserted: 0 };
  const parsed = z.array(repoStatSchema).parse(data);
  for (const item of parsed) {
    await queryD1("repo_stats.insert", () => db.insert(repoStats).values(item));
  }
  return { inserted: parsed.length };
}

/** page-comments: ページ付箋コメント INSERT */
export async function processPageComments(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number }> {
  if (data.length === 0) return { inserted: 0 };
  const parsed = z.array(pageCommentSchema).parse(data);
  for (const item of parsed) {
    await queryD1("page_comments.insert", () =>
      db.insert(pageComments).values(item),
    );
  }
  return { inserted: parsed.length };
}
