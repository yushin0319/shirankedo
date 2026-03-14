import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// 共通: created_at / updated_at
const timestamps = {
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
};

// ============================================================
// 記事
// ============================================================

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").unique().notNull(),
  title: text("title").notNull(),
  source: text("source").notNull(), // 'hackernews' | 'hatena' | 'zenn' | 'lobsters' | 'arxiv'（カンマ区切り可）
  summary: text("summary").notNull(), // 1行要約（検索用）
  comment: text("comment").notNull(), // 200字ギャル要約（表示用）
  tags: text("tags").notNull(), // JSON配列 '["AI","フロントエンド"]'
  impact: integer("impact").notNull(), // 1-10（Gemini採点）
  isPaper: integer("is_paper").notNull().default(0), // 1=注目論文枠
  publishedAt: text("published_at").notNull(),
  ...timestamps,
});

// ============================================================
// トレンド
// ============================================================

export const trackingRepos = sqliteTable("tracking_repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repo: text("repo").unique().notNull(), // 'vllm-project/vllm'
  displayName: text("display_name").notNull(),
  description: text("description"),
  language: text("language"),
  ...timestamps,
});

export const repoStats = sqliteTable("repo_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repo: text("repo").notNull(),
  stars: integer("stars").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ============================================================
// セキュリティ
// ============================================================

export const vulnerabilities = sqliteTable("vulnerabilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cveId: text("cve_id").unique().notNull(),
  title: text("title").notNull(), // Gemini生成の日本語タイトル
  cvssScore: real("cvss_score"), // 0.0-10.0（UPSERT更新あり）
  publishedAt: text("published_at").notNull(),
  ...timestamps,
});

export const releases = sqliteTable(
  "releases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repo: text("repo").notNull(),
    tag: text("tag").notNull(), // 生タグ 'v4.0.0'
    version: text("version").notNull(), // 正規化 '4.0.0'
    type: text("type").notNull(), // 'major' | 'minor'
    publishedAt: text("published_at").notNull(),
    ...timestamps,
  },
  (table) => [unique().on(table.repo, table.tag)],
);

export const securityDaily = sqliteTable("security_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comment: text("comment").notNull(), // ギャルコメント（Gemini生成）
  vulnIds: text("vuln_ids"), // JSON配列（CVE-IDリスト）
  releaseIds: text("release_ids"), // JSON配列（releases.idリスト）
  ...timestamps,
});

// ============================================================
// AI比較
// ============================================================

export const llmModels = sqliteTable("llm_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelName: text("model_name").unique().notNull(),
  provider: text("provider").notNull(),
  score: real("score"), // ELO（Artificial Analysis Arena）
  inputPrice: real("input_price").notNull(), // 原通貨/1M tokens
  outputPrice: real("output_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  ...timestamps,
});

export const llmModelHistory = sqliteTable("llm_model_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelName: text("model_name").notNull(),
  provider: text("provider").notNull(),
  score: real("score"),
  inputPrice: real("input_price").notNull(),
  outputPrice: real("output_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  changedAt: text("changed_at").notNull(), // この時点まで有効だった旧状態
});

export const subscriptionPlans = sqliteTable(
  "subscription_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    service: text("service").notNull(), // 'ChatGPT' | 'Claude' | 'Gemini' | ...
    planName: text("plan_name").notNull(),
    price: real("price").notNull(), // 月額（原通貨、0=無料）
    currency: text("currency").notNull().default("USD"),
    models: text("models").notNull(), // JSON配列
    limits: text("limits"), // 制限・備考（なければNULL）
    ...timestamps,
  },
  (table) => [unique().on(table.service, table.planName)],
);

export const subscriptionPlanHistory = sqliteTable(
  "subscription_plan_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    service: text("service").notNull(),
    planName: text("plan_name").notNull(),
    price: real("price").notNull(),
    currency: text("currency").notNull().default("USD"),
    models: text("models").notNull(),
    limits: text("limits"),
    changedAt: text("changed_at").notNull(),
  },
);

// ============================================================
// 週次レポート・ページコメント
// ============================================================

export const weeklySummaries = sqliteTable("weekly_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(), // 日次データ7日分の集約レポート
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const pageComments = sqliteTable("page_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // 'trend' | 'ai_api' | 'ai_sub'
  content: text("content").notNull(), // ギャルコメント（Gemini生成）
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
