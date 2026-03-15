// n8n データ投入用 Zod バリデーションスキーマ
import { z } from "zod";

/** 記事 */
export const articleSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  summary: z.string().min(1),
  comment: z.string().min(1),
  tags: z.array(z.string()).transform((v) => JSON.stringify(v)),
  impact: z.number().int().min(1).max(10),
  isPaper: z.number().int().min(0).max(1).default(0),
  publishedAt: z.string().min(1),
});

/** 記事配列（POST /api/ingest/articles のリクエストボディ） */
export const dailyArticlesSchema = z.array(articleSchema);

/** 脆弱性 */
export const vulnerabilitySchema = z.object({
  cveId: z.string().min(1),
  title: z.string().min(1),
  cvssScore: z.number().optional(),
  publishedAt: z.string().min(1),
});

/** リリース */
export const releaseSchema = z.object({
  repo: z.string().min(1),
  tag: z.string().min(1),
  version: z.string().min(1),
  type: z.enum(["major", "minor"]),
  publishedAt: z.string().min(1),
});

/** セキュリティ日次サマリー */
export const securityDailySchema = z.object({
  comment: z.string().min(1),
  vulnIds: z
    .array(z.string())
    .optional()
    .transform((v) => (v ? JSON.stringify(v) : undefined)),
  releaseIds: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .transform((v) => (v ? JSON.stringify(v) : undefined)),
});

/** 追跡リポジトリ */
export const trackingRepoSchema = z.object({
  repo: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  language: z.string().optional(),
  publishedAt: z.string().optional(),
});

/** Star推移（週次スナップショット） */
export const repoStatSchema = z.object({
  repo: z.string().min(1),
  stars: z.number().int().min(0),
});

/** LLMモデル */
export const llmModelSchema = z.object({
  modelName: z.string().min(1),
  provider: z.string().min(1),
  score: z.number().optional(),
  inputPrice: z.number().min(0),
  outputPrice: z.number().min(0),
  currency: z.string().default("USD"),
});

/** サブスクリプションプラン */
export const subscriptionPlanSchema = z.object({
  provider: z.string().min(1),
  service: z.string().min(1),
  planName: z.string().min(1),
  price: z.number().min(0),
  currency: z.string().default("USD"),
  models: z.array(z.string()).transform((v) => JSON.stringify(v)),
  limits: z.string().optional(),
});

/** 週次サマリー */
export const weeklySummarySchema = z.object({
  content: z.string().min(1),
});

/** ページコメント（付箋） */
export const pageCommentSchema = z.object({
  type: z.enum(["trend", "ai_api", "ai_sub"]),
  content: z.string().min(1),
});
