import { beforeEach, describe, expect, it } from "vitest";
import {
  llmModelHistory,
  llmModels,
  subscriptionPlanHistory,
  subscriptionPlans,
} from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import {
  LLM_PRUNE_MIN_MODELS,
  processLlmModels,
  processSubscriptionPlans,
} from "./ingest-history";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("processLlmModels", () => {
  const validModel = {
    modelName: "claude-opus-4-6",
    provider: "anthropic",
    score: 95.2,
    inputPrice: 15.0,
    outputPrice: 75.0,
  };

  it("新規モデルを INSERT できる", async () => {
    const result = await processLlmModels(db, [validModel]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.historyCreated).toBe(0);
    const rows = await db.select().from(llmModels);
    expect(rows).toHaveLength(1);
    expect(rows[0].currency).toBe("USD");
  });

  it("価格変更時に history を作成し更新する", async () => {
    await processLlmModels(db, [validModel]);
    const result = await processLlmModels(db, [
      { ...validModel, inputPrice: 10.0 },
    ]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.historyCreated).toBe(1);

    // 本テーブルは更新済み
    const models = await db.select().from(llmModels);
    expect(models[0].inputPrice).toBe(10.0);

    // history に旧値が保存
    const history = await db.select().from(llmModelHistory);
    expect(history).toHaveLength(1);
    expect(history[0].inputPrice).toBe(15.0);
    expect(history[0].modelName).toBe("claude-opus-4-6");
  });

  it("変更なしの場合は何もしない", async () => {
    await processLlmModels(db, [validModel]);
    const result = await processLlmModels(db, [validModel]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.historyCreated).toBe(0);
    const history = await db.select().from(llmModelHistory);
    expect(history).toHaveLength(0);
  });

  it("空配列で 0/0/0/0 を返す", async () => {
    const result = await processLlmModels(db, []);
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      historyCreated: 0,
      deleted: 0,
    });
  });

  /** 一覧全体を模した N 件のモデル */
  function fullList(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      ...validModel,
      modelName: `model-${i}`,
    }));
  }

  it("一覧全体の送信時、一覧に無い既存モデルは履歴に残して削除する", async () => {
    const list = fullList(LLM_PRUNE_MIN_MODELS);
    await processLlmModels(db, [
      ...list,
      { ...validModel, modelName: "old-model", inputPrice: 1 },
    ]);

    const result = await processLlmModels(db, list);
    expect(result.deleted).toBe(1);
    expect(result.inserted).toBe(0);

    const names = (await db.select().from(llmModels)).map((m) => m.modelName);
    expect(names).toHaveLength(LLM_PRUNE_MIN_MODELS);
    expect(names).not.toContain("old-model");

    // 削除したモデルの最終値は history に残る
    const history = await db.select().from(llmModelHistory);
    expect(history).toHaveLength(1);
    expect(history[0].modelName).toBe("old-model");
    expect(history[0].inputPrice).toBe(1);
  });

  it("件数が少ない送信（部分取得の疑い）では削除しない", async () => {
    await processLlmModels(db, fullList(LLM_PRUNE_MIN_MODELS));

    const result = await processLlmModels(db, fullList(3));
    expect(result.deleted).toBe(0);
    const rows = await db.select().from(llmModels);
    expect(rows).toHaveLength(LLM_PRUNE_MIN_MODELS);
  });
});

describe("processSubscriptionPlans", () => {
  const validPlan = {
    provider: "Anthropic",
    service: "Claude",
    planName: "Pro",
    price: 20,
    models: ["claude-opus-4-6", "claude-sonnet-4-6"],
    limits: "無制限",
  };

  it("新規プランを INSERT できる", async () => {
    const result = await processSubscriptionPlans(db, [validPlan]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    const rows = await db.select().from(subscriptionPlans);
    expect(rows).toHaveLength(1);
    expect(rows[0].models).toBe('["claude-opus-4-6","claude-sonnet-4-6"]');
  });

  it("価格変更時に history を作成し更新する", async () => {
    await processSubscriptionPlans(db, [validPlan]);
    const result = await processSubscriptionPlans(db, [
      { ...validPlan, price: 25 },
    ]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.historyCreated).toBe(1);

    const plans = await db.select().from(subscriptionPlans);
    expect(plans[0].price).toBe(25);

    const history = await db.select().from(subscriptionPlanHistory);
    expect(history).toHaveLength(1);
    expect(history[0].price).toBe(20);
  });

  it("変更なしの場合は何もしない", async () => {
    await processSubscriptionPlans(db, [validPlan]);
    const result = await processSubscriptionPlans(db, [validPlan]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.historyCreated).toBe(0);
  });
});
