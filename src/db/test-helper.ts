// テスト用: better-sqlite3 で in-memory DB を作り、Drizzle を返す
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
