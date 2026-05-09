// ShiranKedo DB スキーマ（Drizzle ORM + D1）

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// 記事
export const articles = sqliteTable(
  "articles",
  {
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
  },
  (table) => [
    // ingest-articles-read.ts: gte(publishedAt, since) + orderBy(desc(publishedAt))
    index("articles_published_at_idx").on(table.publishedAt),
  ],
);

// 追跡リポジトリ
export const trackingRepos = sqliteTable("tracking_repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repo: text("repo").unique().notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  language: text("language"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// Star推移（週次スナップショット）
export const repoStats = sqliteTable(
  "repo_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repo: text("repo").notNull(),
    stars: integer("stars").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("repo_stats_repo_idx").on(table.repo),
    // trend-ranking.ts / trend.astro: orderBy(desc(createdAt))
    index("repo_stats_created_at_idx").on(table.createdAt),
  ],
);

// LLMモデル共通カラム（現在テーブルと履歴テーブルで共有）
const llmModelDataColumns = {
  modelName: text("model_name").notNull(),
  provider: text("provider").notNull(),
  score: real("score"),
  inputPrice: real("input_price").notNull(),
  outputPrice: real("output_price").notNull(),
  currency: text("currency").notNull().default("USD"),
};

// LLMモデル（現在の状態）
export const llmModels = sqliteTable("llm_models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...llmModelDataColumns,
  modelName: text("model_name").unique().notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at"),
});

// LLMモデル変更履歴
export const llmModelHistory = sqliteTable("llm_model_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...llmModelDataColumns,
  changedAt: text("changed_at").notNull(),
});

// サブスクプラン共通カラム（現在テーブルと履歴テーブルで共有）
const subscriptionPlanDataColumns = {
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  planName: text("plan_name").notNull(),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  models: text("models").notNull(), // JSON配列
  limits: text("limits"),
};

// サブスクプラン
export const subscriptionPlans = sqliteTable(
  "subscription_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...subscriptionPlanDataColumns,
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
    ...subscriptionPlanDataColumns,
    changedAt: text("changed_at").notNull(),
  },
);

// ページ付箋コメント
export const pageComments = sqliteTable(
  "page_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    // trend.astro: orderBy(desc(createdAt))
    index("page_comments_created_at_idx").on(table.createdAt),
  ],
);
