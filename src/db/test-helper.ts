// テスト用: better-sqlite3 で in-memory DB を作り、Drizzle を返す
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppDatabase } from "./client";
import * as schema from "./schema";

/** 全テーブルの CREATE TABLE SQL */
export const CREATE_TABLES_SQL = `
	CREATE TABLE articles (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		url TEXT UNIQUE NOT NULL,
		title TEXT NOT NULL,
		source TEXT NOT NULL,
		summary TEXT NOT NULL,
		comment TEXT NOT NULL,
		tags TEXT NOT NULL,
		impact INTEGER NOT NULL,
		is_paper INTEGER NOT NULL DEFAULT 0,
		published_at TEXT NOT NULL,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT
	);
	CREATE TABLE tracking_repos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo TEXT UNIQUE NOT NULL,
		display_name TEXT NOT NULL,
		description TEXT,
		language TEXT,
		published_at TEXT,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT
	);
	CREATE TABLE repo_stats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo TEXT NOT NULL,
		stars INTEGER NOT NULL,
		created_at TEXT DEFAULT (datetime('now'))
	);
	CREATE TABLE vulnerabilities (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		cve_id TEXT UNIQUE NOT NULL,
		title TEXT NOT NULL,
		cvss_score REAL,
		published_at TEXT NOT NULL,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT
	);
	CREATE TABLE releases (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		repo TEXT NOT NULL,
		tag TEXT NOT NULL,
		version TEXT NOT NULL,
		type TEXT NOT NULL,
		published_at TEXT NOT NULL,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT,
		UNIQUE (repo, tag)
	);
	CREATE TABLE security_daily (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		comment TEXT NOT NULL,
		vuln_ids TEXT,
		release_ids TEXT,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT
	);
	CREATE TABLE llm_models (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		model_name TEXT UNIQUE NOT NULL,
		provider TEXT NOT NULL,
		score REAL,
		input_price REAL NOT NULL,
		output_price REAL NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT
	);
	CREATE TABLE llm_model_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		model_name TEXT NOT NULL,
		provider TEXT NOT NULL,
		score REAL,
		input_price REAL NOT NULL,
		output_price REAL NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		changed_at TEXT NOT NULL
	);
	CREATE TABLE subscription_plans (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		provider TEXT NOT NULL,
		service TEXT NOT NULL,
		plan_name TEXT NOT NULL,
		price REAL NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		models TEXT NOT NULL,
		limits TEXT,
		created_at TEXT DEFAULT (datetime('now')),
		updated_at TEXT,
		UNIQUE (service, plan_name)
	);
	CREATE TABLE subscription_plan_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		provider TEXT NOT NULL,
		service TEXT NOT NULL,
		plan_name TEXT NOT NULL,
		price REAL NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		models TEXT NOT NULL,
		limits TEXT,
		changed_at TEXT NOT NULL
	);
	CREATE TABLE weekly_summaries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		content TEXT NOT NULL,
		created_at TEXT DEFAULT (datetime('now'))
	);
	CREATE TABLE page_comments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		type TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at TEXT DEFAULT (datetime('now'))
	);
`;

export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** テスト用 DB を作成し、全テーブルを作成して返す */
export function createTestDbWithTables() {
  const { db, sqlite } = createTestDb();
  sqlite.exec(CREATE_TABLES_SQL);
  // BetterSQLite3Database と DrizzleD1Database はクエリ API 互換
  // batch() はテストで使わないため安全にキャスト
  return { db: db as unknown as AppDatabase, sqlite };
}
