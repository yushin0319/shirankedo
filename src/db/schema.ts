// ShiranKedo DB スキーマ（Drizzle ORM + D1）

import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// 記事
export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").unique().notNull(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  summary: text("summary").notNull(),
  comment: text("comment").notNull(),
  tags: text("tags").notNull(), // JSON配列
  impact: integer("impact").notNull(),
  isPaper: integer("is_paper").notNull().default(0),
  publishedAt: text("published_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// 追跡リポジトリ
export const trackingRepos = sqliteTable("tracking_repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repo: text("repo").unique().notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  language: text("language"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// Star推移（週次スナップショット）
export const repoStats = sqliteTable("repo_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repo: text("repo").notNull(),
  stars: integer("stars").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// 脆弱性
export const vulnerabilities = sqliteTable("vulnerabilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cveId: text("cve_id").unique().notNull(),
  title: text("title").notNull(),
  cvssScore: real("cvss_score"),
  publishedAt: text("published_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// リリース
export const releases = sqliteTable(
  "releases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repo: text("repo").notNull(),
    tag: text("tag").notNull(),
    version: text("version").notNull(),
    type: text("type").notNull(),
    publishedAt: text("published_at").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at"),
  },
  (table) => [
    uniqueIndex("releases_repo_tag_unique").on(table.repo, table.tag),
  ],
);

// セキュリティ日次サマリー
export const securityDaily = sqliteTable("security_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comment: text("comment").notNull(),
  vulnIds: text("vuln_ids"), // JSON配列
  releaseIds: text("release_ids"), // JSON配列
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// LLMモデル（現在の状態）
export const llmModels = sqliteTable("llm_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelName: text("model_name").unique().notNull(),
  provider: text("provider").notNull(),
  score: real("score"),
  inputPrice: real("input_price").notNull(),
  outputPrice: real("output_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// LLMモデル変更履歴
export const llmModelHistory = sqliteTable("llm_model_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelName: text("model_name").notNull(),
  provider: text("provider").notNull(),
  score: real("score"),
  inputPrice: real("input_price").notNull(),
  outputPrice: real("output_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  changedAt: text("changed_at").notNull(),
});

// サブスクプラン
export const subscriptionPlans = sqliteTable(
  "subscription_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    service: text("service").notNull(),
    planName: text("plan_name").notNull(),
    price: real("price").notNull(),
    currency: text("currency").notNull().default("USD"),
    models: text("models").notNull(), // JSON配列
    limits: text("limits"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at"),
  },
  (table) => [
    uniqueIndex("sub_plans_service_plan_unique").on(
      table.service,
      table.planName,
    ),
  ],
);

// サブスクプラン変更履歴
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

// 週次レポート（内部参考用）
export const weeklySummaries = sqliteTable("weekly_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ページ付箋コメント
export const pageComments = sqliteTable("page_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
