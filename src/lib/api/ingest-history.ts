// 変更検知付き UPSERT（llm-models, subscription-plans）
// 書き込み操作は db.batch() でアトミックに実行
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import {
  llmModelHistory,
  llmModels,
  subscriptionPlanHistory,
  subscriptionPlans,
} from "../../db/schema";
import { queryD1 } from "../d1-wrapper";
import { llmModelSchema, subscriptionPlanSchema } from "./schemas";

// db.batch() に渡せるクエリの型
type BatchQuery = Parameters<AppDatabase["batch"]>[0][number];

/** LLM モデル: UPSERT + 変更検知 → history（batch で一括書き込み） */
export async function processLlmModels(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number; historyCreated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0, historyCreated: 0 };
  const parsed = z.array(llmModelSchema).parse(data);

  const names = parsed.map((m) => m.modelName);
  const existing = await queryD1("llm_models.existing", () =>
    db.select().from(llmModels).where(inArray(llmModels.modelName, names)),
  );
  const existingMap = new Map(existing.map((m) => [m.modelName, m]));

  let inserted = 0;
  let updated = 0;
  let historyCreated = 0;
  const writes: BatchQuery[] = [];

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
        // 旧値を history に保存 + 本テーブルを更新
        writes.push(
          db.insert(llmModelHistory).values({
            modelName: old.modelName,
            provider: old.provider,
            score: old.score,
            inputPrice: old.inputPrice,
            outputPrice: old.outputPrice,
            currency: old.currency,
            changedAt: new Date().toISOString(),
          }),
        );
        writes.push(
          db
            .update(llmModels)
            .set({
              provider: item.provider,
              score: item.score,
              inputPrice: item.inputPrice,
              outputPrice: item.outputPrice,
              currency: item.currency,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(llmModels.modelName, item.modelName)),
        );
        historyCreated++;
        updated++;
      }
    } else {
      writes.push(db.insert(llmModels).values(item));
      inserted++;
    }
  }

  if (writes.length > 0) {
    await queryD1("llm_models.batch", () =>
      db.batch(writes as [BatchQuery, ...BatchQuery[]]),
    );
  }
  return { inserted, updated, historyCreated };
}

/** サブスクプラン: UPSERT + 変更検知 → history（batch で一括書き込み） */
export async function processSubscriptionPlans(
  db: AppDatabase,
  data: unknown[],
): Promise<{ inserted: number; updated: number; historyCreated: number }> {
  if (data.length === 0) return { inserted: 0, updated: 0, historyCreated: 0 };
  const parsed = z.array(subscriptionPlanSchema).parse(data);

  const services = [...new Set(parsed.map((p) => p.service))];
  const existing = await queryD1("subscription_plans.existing", () =>
    db
      .select()
      .from(subscriptionPlans)
      .where(inArray(subscriptionPlans.service, services)),
  );
  const existingMap = new Map(
    existing.map((p) => [`${p.service}:${p.planName}`, p]),
  );

  let inserted = 0;
  let updated = 0;
  let historyCreated = 0;
  const writes: BatchQuery[] = [];

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
        writes.push(
          db.insert(subscriptionPlanHistory).values({
            provider: old.provider,
            service: old.service,
            planName: old.planName,
            price: old.price,
            currency: old.currency,
            models: old.models,
            limits: old.limits,
            changedAt: new Date().toISOString(),
          }),
        );
        writes.push(
          db
            .update(subscriptionPlans)
            .set({
              provider: item.provider,
              price: item.price,
              currency: item.currency,
              models: item.models,
              limits: item.limits,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(subscriptionPlans.id, old.id)),
        );
        historyCreated++;
        updated++;
      }
    } else {
      writes.push(db.insert(subscriptionPlans).values(item));
      inserted++;
    }
  }

  if (writes.length > 0) {
    await queryD1("subscription_plans.batch", () =>
      db.batch(writes as [BatchQuery, ...BatchQuery[]]),
    );
  }
  return { inserted, updated, historyCreated };
}
