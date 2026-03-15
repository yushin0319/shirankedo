// 変更検知付き UPSERT（llm-models, subscription-plans）
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import {
  llmModelHistory,
  llmModels,
  subscriptionPlanHistory,
  subscriptionPlans,
} from "../../db/schema";
import { llmModelSchema, subscriptionPlanSchema } from "./schemas";

/** LLM モデル: UPSERT + 変更検知 → history */
export async function processLlmModels(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number; historyCreated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0, historyCreated: 0 };
  const parsed = z.array(llmModelSchema).parse(data);

  const names = parsed.map((m) => m.modelName);
  const existing = await db
    .select()
    .from(llmModels)
    .where(inArray(llmModels.modelName, names));
  const existingMap = new Map(existing.map((m) => [m.modelName, m]));

  let inserted = 0;
  let updated = 0;
  let historyCreated = 0;

  for (const item of parsed) {
    const old = existingMap.get(item.modelName);
    if (old) {
      // 変更検知: 価格 or score が変わった場合のみ更新
      const changed =
        old.inputPrice !== item.inputPrice ||
        old.outputPrice !== item.outputPrice ||
        old.score !== (item.score ?? null) ||
        old.provider !== item.provider;

      if (changed) {
        // 旧値を history に保存
        await db.insert(llmModelHistory).values({
          modelName: old.modelName,
          provider: old.provider,
          score: old.score,
          inputPrice: old.inputPrice,
          outputPrice: old.outputPrice,
          currency: old.currency,
          changedAt: new Date().toISOString(),
        });
        historyCreated++;

        // 本テーブルを更新
        await db
          .update(llmModels)
          .set({
            provider: item.provider,
            score: item.score,
            inputPrice: item.inputPrice,
            outputPrice: item.outputPrice,
            currency: item.currency,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(llmModels.modelName, item.modelName));
        updated++;
      }
    } else {
      await db.insert(llmModels).values(item);
      inserted++;
    }
  }
  return { inserted, updated, historyCreated };
}

/** サブスクプラン: UPSERT + 変更検知 → history */
export async function processSubscriptionPlans(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number; historyCreated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0, historyCreated: 0 };
  const parsed = z.array(subscriptionPlanSchema).parse(data);

  const services = [...new Set(parsed.map((p) => p.service))];
  const existing = await db
    .select()
    .from(subscriptionPlans)
    .where(inArray(subscriptionPlans.service, services));
  const existingMap = new Map(
    existing.map((p) => [`${p.service}:${p.planName}`, p]),
  );

  let inserted = 0;
  let updated = 0;
  let historyCreated = 0;

  for (const item of parsed) {
    const key = `${item.service}:${item.planName}`;
    const old = existingMap.get(key);
    if (old) {
      const changed =
        old.price !== item.price ||
        old.models !== item.models ||
        old.limits !== (item.limits ?? null) ||
        old.provider !== item.provider;

      if (changed) {
        await db.insert(subscriptionPlanHistory).values({
          provider: old.provider,
          service: old.service,
          planName: old.planName,
          price: old.price,
          currency: old.currency,
          models: old.models,
          limits: old.limits,
          changedAt: new Date().toISOString(),
        });
        historyCreated++;

        await db
          .update(subscriptionPlans)
          .set({
            provider: item.provider,
            price: item.price,
            currency: item.currency,
            models: item.models,
            limits: item.limits,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(subscriptionPlans.id, old.id));
        updated++;
      }
    } else {
      await db.insert(subscriptionPlans).values(item);
      inserted++;
    }
  }
  return { inserted, updated, historyCreated };
}
