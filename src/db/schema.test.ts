import type Database from "better-sqlite3";
import { desc, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  articles,
  llmModelHistory,
  llmModels,
  pageComments,
  releases,
  repoStats,
  securityDaily,
  subscriptionPlanHistory,
  subscriptionPlans,
  vulnerabilities,
} from "./schema";
import { createTestDb } from "./test-helper";

type TestDb = ReturnType<typeof createTestDb>["db"];

let db: TestDb;
let sqlite: InstanceType<typeof Database>;

beforeEach(() => {
  const t = createTestDb();
  db = t.db;
  sqlite = t.sqlite as InstanceType<typeof Database>;

  // スキーマからテーブル作成（マイグレーションの代わり）
  sqlite.exec(`
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
	`);
});

describe("articles", () => {
  it("記事を挿入して取得できる", async () => {
    await db.insert(articles).values({
      url: "https://example.com/1",
      title: "テスト記事",
      source: "hackernews",
      summary: "要約テスト",
      comment: "コメントテスト",
      tags: '["AI"]',
      impact: 8,
      publishedAt: "2026-03-13",
    });

    const rows = await db.select().from(articles);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("テスト記事");
    expect(rows[0].impact).toBe(8);
    expect(rows[0].isPaper).toBe(0);
  });

  it("impact降順でソートされる", async () => {
    await db.insert(articles).values([
      {
        url: "https://example.com/low",
        title: "低インパクト",
        source: "zenn",
        summary: "s",
        comment: "c",
        tags: "[]",
        impact: 3,
        publishedAt: "2026-03-13",
      },
      {
        url: "https://example.com/high",
        title: "高インパクト",
        source: "hatena",
        summary: "s",
        comment: "c",
        tags: "[]",
        impact: 9,
        publishedAt: "2026-03-13",
      },
    ]);

    const rows = await db
      .select()
      .from(articles)
      .orderBy(desc(articles.impact));

    expect(rows[0].title).toBe("高インパクト");
    expect(rows[1].title).toBe("低インパクト");
  });

  it("URLのUNIQUE制約が効く", async () => {
    const row = {
      url: "https://example.com/dup",
      title: "記事1",
      source: "hackernews",
      summary: "s",
      comment: "c",
      tags: "[]",
      impact: 5,
      publishedAt: "2026-03-13",
    };

    await db.insert(articles).values(row);
    await expect(
      db.insert(articles).values({ ...row, title: "記事2" }),
    ).rejects.toThrow();
  });
});

describe("llmModels", () => {
  it("モデルを挿入してscore降順で取得できる", async () => {
    await db.insert(llmModels).values([
      {
        modelName: "GPT-4o",
        provider: "OpenAI",
        score: 1280,
        inputPrice: 2.5,
        outputPrice: 10,
      },
      {
        modelName: "Claude Sonnet 4",
        provider: "Anthropic",
        score: 1320,
        inputPrice: 3,
        outputPrice: 15,
      },
    ]);

    const rows = await db
      .select()
      .from(llmModels)
      .orderBy(desc(llmModels.score));

    expect(rows[0].modelName).toBe("Claude Sonnet 4");
    expect(rows[1].modelName).toBe("GPT-4o");
  });

  it("scoreがnullのモデルも扱える", async () => {
    await db.insert(llmModels).values({
      modelName: "新モデル",
      provider: "Google",
      score: null,
      inputPrice: 1,
      outputPrice: 2,
    });

    const rows = await db.select().from(llmModels);
    expect(rows[0].score).toBeNull();
  });
});

describe("subscriptionPlans", () => {
  it("provider, price順でソートされる", async () => {
    await db.insert(subscriptionPlans).values([
      {
        provider: "OpenAI",
        service: "ChatGPT",
        planName: "Plus",
        price: 20,
        models: '["GPT-4o"]',
      },
      {
        provider: "Anthropic",
        service: "Claude",
        planName: "Pro",
        price: 20,
        models: '["Claude Sonnet 4"]',
      },
      {
        provider: "OpenAI",
        service: "ChatGPT",
        planName: "Free",
        price: 0,
        models: '["GPT-4o-mini"]',
      },
    ]);

    const rows = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(subscriptionPlans.provider, subscriptionPlans.price);

    expect(rows[0].service).toBe("Claude");
    expect(rows[1].planName).toBe("Free");
    expect(rows[2].planName).toBe("Plus");
  });

  it("service+planNameのUNIQUE制約が効く", async () => {
    const plan = {
      provider: "OpenAI",
      service: "ChatGPT",
      planName: "Plus",
      price: 20,
      models: '["GPT-4o"]',
    };

    await db.insert(subscriptionPlans).values(plan);
    await expect(
      db.insert(subscriptionPlans).values({ ...plan, price: 30 }),
    ).rejects.toThrow();
  });
});

describe("vulnerabilities", () => {
  it("cvssScore降順でソートされる", async () => {
    await db.insert(vulnerabilities).values([
      {
        cveId: "CVE-2026-001",
        title: "低危険度",
        cvssScore: 3.5,
        publishedAt: "2026-03-10",
      },
      {
        cveId: "CVE-2026-002",
        title: "高危険度",
        cvssScore: 9.8,
        publishedAt: "2026-03-12",
      },
    ]);

    const rows = await db
      .select()
      .from(vulnerabilities)
      .orderBy(desc(vulnerabilities.cvssScore));

    expect(rows[0].title).toBe("高危険度");
    expect(rows[0].cvssScore).toBe(9.8);
  });

  it("cvssScoreがnullでも挿入できる", async () => {
    await db.insert(vulnerabilities).values({
      cveId: "CVE-2026-003",
      title: "スコア未定",
      cvssScore: null,
      publishedAt: "2026-03-13",
    });

    const rows = await db.select().from(vulnerabilities);
    expect(rows[0].cvssScore).toBeNull();
  });
});

describe("repoStats", () => {
  it("同一リポの2週分データからstar差分を計算できる", async () => {
    await db.insert(repoStats).values([
      { repo: "facebook/react", stars: 230000, createdAt: "2026-03-06" },
      { repo: "facebook/react", stars: 230500, createdAt: "2026-03-13" },
    ]);

    // 最新と前週のデータを取得して差分計算
    const rows = await db
      .select()
      .from(repoStats)
      .where(sql`${repoStats.repo} = 'facebook/react'`)
      .orderBy(desc(repoStats.createdAt));

    expect(rows).toHaveLength(2);
    const diff = rows[0].stars - rows[1].stars;
    expect(diff).toBe(500);
  });
});

describe("pageComments", () => {
  it("typeでフィルタして最新1件を取得できる", async () => {
    await db.insert(pageComments).values([
      { type: "trend", content: "古いコメント", createdAt: "2026-03-06" },
      { type: "trend", content: "新しいコメント", createdAt: "2026-03-13" },
      { type: "ai_api", content: "別タイプ", createdAt: "2026-03-13" },
    ]);

    const rows = await db
      .select()
      .from(pageComments)
      .where(sql`${pageComments.type} = 'trend'`)
      .orderBy(desc(pageComments.createdAt))
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("新しいコメント");
  });
});

describe("releases", () => {
  it("repo+tagのUNIQUE制約が効く", async () => {
    const release = {
      repo: "facebook/react",
      tag: "v19.0.0",
      version: "19.0.0",
      type: "major",
      publishedAt: "2026-03-10",
    };

    await db.insert(releases).values(release);
    await expect(
      db.insert(releases).values({ ...release, version: "19.0.1" }),
    ).rejects.toThrow();
  });
});

describe("securityDaily", () => {
  it("JSON配列のvuln_ids/release_idsを保存・取得できる", async () => {
    await db.insert(securityDaily).values({
      comment: "今日のセキュリティまとめ",
      vulnIds: '["CVE-2026-001","CVE-2026-002"]',
      releaseIds: "[1,2]",
    });

    const rows = await db.select().from(securityDaily);
    expect(rows).toHaveLength(1);
    const vulns = JSON.parse(rows[0].vulnIds ?? "[]");
    expect(vulns).toEqual(["CVE-2026-001", "CVE-2026-002"]);
  });
});

describe("履歴テーブル", () => {
  it("llmModelHistoryに変更前の状態を保存できる", async () => {
    await db.insert(llmModelHistory).values({
      modelName: "GPT-4o",
      provider: "OpenAI",
      score: 1250,
      inputPrice: 5,
      outputPrice: 15,
      changedAt: "2026-03-01",
    });

    const rows = await db.select().from(llmModelHistory);
    expect(rows[0].score).toBe(1250);
    expect(rows[0].changedAt).toBe("2026-03-01");
  });

  it("subscriptionPlanHistoryに変更前の状態を保存できる", async () => {
    await db.insert(subscriptionPlanHistory).values({
      provider: "OpenAI",
      service: "ChatGPT",
      planName: "Plus",
      price: 20,
      models: '["GPT-4"]',
      changedAt: "2026-02-01",
    });

    const rows = await db.select().from(subscriptionPlanHistory);
    expect(rows[0].price).toBe(20);
    expect(rows[0].changedAt).toBe("2026-02-01");
  });
});
