// テスト用: better-sqlite3 で in-memory DB を作り、Drizzle を返す
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppDatabase } from "./client";
import * as schema from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../drizzle");

/** マイグレーションファイルから CREATE TABLE SQL を読み込む */
function loadMigrationSQL(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8"))
    .join("\n");
}

export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** テスト用 DB を作成し、全テーブルを作成して返す */
export function createTestDbWithTables() {
  const { db, sqlite } = createTestDb();
  sqlite.exec(loadMigrationSQL());
  // BetterSQLite3Database と DrizzleD1Database はクエリ API 互換
  // batch() は D1 専用のため、テスト用に逐次実行 shim を追加
  const dbWithBatch = Object.assign(db, {
    batch: async (queries: unknown[]) => {
      const results = [];
      for (const q of queries) {
        results.push(await q);
      }
      return results;
    },
  });
  return { db: dbWithBatch as unknown as AppDatabase, sqlite };
}
