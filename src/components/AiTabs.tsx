import type { InferSelectModel } from "drizzle-orm";
import { useMemo, useState } from "react";
import type { llmModels, subscriptionPlans } from "../db/schema";
import { estimateMonthly, getTier, parseModels } from "../lib/ai";
import {
  getProviderGapIndices,
  nextSortState,
  type SortState,
  sortByKey,
} from "../lib/sort";

type LlmModel = InferSelectModel<typeof llmModels>;
type SubscriptionPlan = InferSelectModel<typeof subscriptionPlans>;

type AiTabsProps = {
  models: LlmModel[];
  plans: SubscriptionPlan[];
  apiCommentText: string | null;
  subCommentText: string | null;
  providerDotClass: Record<string, string>;
  jpyPerUsd?: number;
};

type ApiRow = {
  model: LlmModel;
  score: number;
  monthlyStr: string;
  monthlyNum: number;
  tier: string;
  dotClass: string;
};

type SubRow = {
  plan: SubscriptionPlan;
  priceStr: string;
  modelList: string[];
  dotClass: string;
};

const STEP = 10;

export function AiTabs({
  models,
  plans,
  apiCommentText,
  subCommentText,
  providerDotClass,
  jpyPerUsd = 150,
}: AiTabsProps) {
  const [activeTab, setActiveTab] = useState<"text" | "sub">("text");
  const [apiSort, setApiSort] = useState<SortState>({
    key: "score",
    dir: "desc",
  });
  const [subSort, setSubSort] = useState<SortState>({
    key: "provider",
    dir: "asc",
  });
  const [apiVisibleCount, setApiVisibleCount] = useState(STEP);

  // API行データを事前計算
  const apiRows: ApiRow[] = useMemo(
    () =>
      models.map((m) => {
        const score = m.score ?? 0;
        const monthly = estimateMonthly(
          m.inputPrice,
          m.outputPrice,
          m.currency,
          jpyPerUsd,
        );
        return {
          model: m,
          score,
          monthlyStr: monthly,
          monthlyNum: Number.parseInt(monthly.replace(/[^0-9]/g, ""), 10) || 0,
          tier: getTier(score),
          dotClass: providerDotClass[m.provider] ?? "",
        };
      }),
    [models, providerDotClass, jpyPerUsd],
  );

  // ソート済みAPI行
  const sortedApiRows = useMemo(() => {
    const sortable = apiRows.map((r) => ({
      ...r,
      provider: r.model.provider,
      monthly: r.monthlyNum,
      price: 0,
    }));
    return sortByKey(sortable, apiSort.key, apiSort.dir);
  }, [apiRows, apiSort]);

  const apiGaps = useMemo(
    () =>
      apiSort.key === "provider"
        ? getProviderGapIndices(sortedApiRows)
        : new Set<number>(),
    [sortedApiRows, apiSort.key],
  );

  // サブスク行データ
  const subRows: SubRow[] = useMemo(
    () =>
      plans.map((p) => ({
        plan: p,
        priceStr:
          p.price === 0
            ? "¥0"
            : p.currency === "JPY"
              ? `¥${p.price.toLocaleString()}`
              : `$${p.price}`,
        modelList: parseModels(p.models),
        dotClass: providerDotClass[p.provider] ?? "",
      })),
    [plans, providerDotClass],
  );

  // ソート済みサブスク行
  const sortedSubRows = useMemo(() => {
    const sortable = subRows.map((r) => ({
      ...r,
      provider: r.plan.provider,
      score: 0,
      monthly: 0,
      price: r.plan.price,
    }));
    return sortByKey(sortable, subSort.key, subSort.dir);
  }, [subRows, subSort]);

  const subGaps = useMemo(
    () =>
      subSort.key === "provider"
        ? getProviderGapIndices(sortedSubRows)
        : new Set<number>(),
    [sortedSubRows, subSort.key],
  );

  // タブ切り替え
  function handleTabClick(tab: "text" | "sub") {
    setActiveTab(tab);
  }

  // APIソート
  function handleApiSort(key: string) {
    const k = key as "provider" | "score" | "monthly";
    setApiSort((prev) => nextSortState(prev, k));
    setApiVisibleCount(STEP);
  }

  // サブスクソート
  function handleSubSort(key: string) {
    const k = key as "provider" | "price";
    setSubSort((prev) => nextSortState(prev, k));
  }

  return (
    <>
      <main className="relative z-1 max-w-265 mx-auto px-10 pb-20 max-md:px-4 max-md:pb-15">
        {/* タブバー */}
        <div className="flex gap-0 border-b border-border mb-0">
          <button
            type="button"
            className={`ai-tab-btn text-[13px] font-medium bg-transparent border-none border-b-2 px-5 py-3 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === "text"
                ? "active text-ink border-b-ink"
                : "text-muted border-b-transparent hover:text-ink"
            }`}
            onClick={() => handleTabClick("text")}
          >
            API利用
          </button>
          <button
            type="button"
            className={`ai-tab-btn text-[13px] font-medium bg-transparent border-none border-b-2 px-5 py-3 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === "sub"
                ? "active text-ink border-b-ink"
                : "text-muted border-b-transparent hover:text-ink"
            }`}
            onClick={() => handleTabClick("sub")}
          >
            サブスク比較
          </button>
        </div>

        {/* TAB 1: API利用 */}
        <div
          className={`ai-tab-panel ${activeTab !== "text" ? "hidden" : ""}`}
          id="tab-text"
        >
          {/* シナリオボックス */}
          <div className="mt-4 flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-[9px] tracking-widest text-muted uppercase shrink-0">
              月額目安 *
            </span>
            <div>
              <div className="text-[12px] leading-[1.6] text-muted">
                ニュース記事編集（
                <span className="font-mono text-[12px] text-muted">
                  2,000字
                </span>
                査読 +{" "}
                <span className="font-mono text-[12px] text-muted">300字</span>
                要約）&times;{" "}
                <span className="font-mono text-[12px] text-muted">100回</span>{" "}
                &times;{" "}
                <span className="font-mono text-[12px] text-muted">30日</span>
              </div>
              <div className="font-mono text-[10px] text-muted">
                * input 1,200tok + output 200tok &times; 3,000 req/mo
              </div>
            </div>
          </div>

          {/* PC テーブル */}
          <div className="hidden md:block bg-surface border border-border rounded-sm shadow-[2px_2px_0_rgba(0,0,0,.06)] overflow-x-auto mt-4">
            <table className="w-full border-collapse" aria-label="AIモデル比較">
              <thead>
                <tr>
                  <th
                    className="font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap"
                    style={{ width: "24%" }}
                  >
                    Model
                  </th>
                  <th
                    className={`font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap cursor-pointer ${apiSort.key === "provider" ? `sort-${apiSort.dir}` : ""}`}
                    style={{ width: "12%" }}
                    data-sort="provider"
                    onClick={() => handleApiSort("provider")}
                    aria-sort={
                      apiSort.key === "provider"
                        ? apiSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Provider
                  </th>
                  <th
                    className={`font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap cursor-pointer ${apiSort.key === "score" ? `sort-${apiSort.dir}` : ""}`}
                    style={{ width: "16%" }}
                    data-sort="score"
                    onClick={() => handleApiSort("score")}
                    aria-sort={
                      apiSort.key === "score"
                        ? apiSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Intelligence
                  </th>
                  <th
                    className="font-mono text-[9px] text-muted tracking-widest uppercase text-right py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap"
                    style={{ width: "18%" }}
                  >
                    $/1M tok (in/out)
                  </th>
                  <th
                    className={`font-mono text-[9px] text-muted tracking-widest uppercase text-right py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap cursor-pointer ${apiSort.key === "monthly" ? `sort-${apiSort.dir}` : ""}`}
                    style={{ width: "14%" }}
                    data-sort="monthly"
                    onClick={() => handleApiSort("monthly")}
                    aria-sort={
                      apiSort.key === "monthly"
                        ? apiSort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    月額目安 *
                  </th>
                </tr>
              </thead>
              <tbody id="api-tbody">
                {sortedApiRows.map((r, i) => (
                  <tr
                    key={r.model.id}
                    className={`hover:bg-[rgba(0,0,0,.015)] transition-colors${
                      i >= apiVisibleCount ? " api-hidden" : ""
                    }${apiGaps.has(i) ? " provider-gap" : ""}`}
                    data-score={r.score.toFixed(1)}
                    data-provider={r.model.provider}
                    data-monthly={r.monthlyNum}
                  >
                    <td className="text-[13px] font-bold text-ink tracking-[-0.01em] py-2.5 px-3.5 border-b border-border align-middle">
                      {r.model.modelName}
                    </td>
                    <td className="py-2.5 px-3.5 border-b border-border align-middle">
                      <span className="flex items-center gap-1.5">
                        <span className={`provider-dot ${r.dotClass}`} />
                        <span className="font-mono text-[10px] text-muted tracking-[.04em]">
                          {r.model.provider}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 border-b border-border align-middle">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`bench-bar ${r.tier}`}
                          style={{ width: `${Math.round(r.score)}px` }}
                        />
                        <span className="font-mono text-[10px] text-muted min-w-5 text-right">
                          {r.score.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="font-mono text-[12px] text-ink text-right py-2.5 px-3.5 border-b border-border align-middle whitespace-nowrap tracking-[.02em]">
                      ${r.model.inputPrice.toFixed(2)} / $
                      {r.model.outputPrice.toFixed(2)}
                    </td>
                    <td className="font-mono text-[12px] text-right py-2.5 px-3.5 border-b border-border align-middle whitespace-nowrap tracking-[.02em]">
                      {r.monthlyStr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SP ソートバー */}
          <div className="hidden max-md:flex items-center gap-1.5 py-2 mt-2">
            <span className="text-[11px] text-muted">並び替え:</span>
            {(["score", "provider", "monthly"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`sp-sort-btn text-[11px] bg-surface border rounded px-2 py-0.5 cursor-pointer ${
                  apiSort.key === key
                    ? "active text-ink border-ink"
                    : "text-muted border-border"
                }`}
                data-sort={key}
                onClick={() => handleApiSort(key)}
              >
                {key === "score"
                  ? "ELO"
                  : key === "provider"
                    ? "Provider"
                    : "月額"}
              </button>
            ))}
          </div>

          {/* SP カード */}
          <div className="md:hidden" id="api-sp">
            {sortedApiRows.map((r, i) => (
              <div
                key={r.model.id}
                className={`sp-card bg-surface border-b border-border py-2 px-3 flex items-center gap-2.5${
                  i === 0 ? " border-t border-t-border" : ""
                }${i >= apiVisibleCount ? " api-hidden-sp" : ""}${
                  apiGaps.has(i) ? " provider-gap" : ""
                }`}
                data-score={r.score.toFixed(1)}
                data-provider={r.model.provider}
                data-monthly={r.monthlyNum}
              >
                <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="font-bold text-[12px]">
                      {r.model.modelName}
                    </span>
                    <span className="font-mono text-[9px] text-muted ml-1">
                      <span className={`provider-dot ${r.dotClass}`} />
                      {r.model.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[9px] text-ink">
                      {r.score.toFixed(1)}
                    </span>
                    <div
                      className={`bench-bar h-0.75 ${r.tier}`}
                      style={{ width: `${Math.round(r.score)}px` }}
                    />
                  </div>
                </div>
                <div className="ml-auto shrink-0">
                  <span className="font-mono text-[11px] whitespace-nowrap">
                    {r.monthlyStr}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {apiVisibleCount < sortedApiRows.length && (
            <button
              type="button"
              className="block w-full py-3 mt-2 bg-transparent border border-dashed border-border rounded-sm font-mono text-[11px] text-muted tracking-[.06em] cursor-pointer transition-all hover:border-ink hover:text-ink"
              id="api-more"
              onClick={() =>
                setApiVisibleCount((prev) =>
                  Math.min(prev + STEP, sortedApiRows.length),
                )
              }
            >
              + もっと見る
            </button>
          )}
        </div>

        {/* TAB 2: サブスク比較 */}
        <div
          className={`ai-tab-panel ${activeTab !== "sub" ? "hidden" : ""}`}
          id="tab-sub"
        >
          <div className="mt-5 mb-4.5">
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">
              サブスクリプション比較
            </h2>
            <div className="h-px bg-border my-2" />
            <span className="font-mono text-[10px] text-muted tracking-[.06em]">
              sorted by provider
            </span>
          </div>

          {/* PC テーブル */}
          <div className="hidden md:block bg-surface border border-border rounded-sm shadow-[2px_2px_0_rgba(0,0,0,.06)] overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    className={`font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap cursor-pointer ${subSort.key === "provider" ? `sort-${subSort.dir}` : ""}`}
                    style={{ width: "12%" }}
                    data-sort="provider"
                    onClick={() => handleSubSort("provider")}
                  >
                    Provider
                  </th>
                  <th
                    className="font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap"
                    style={{ width: "12%" }}
                  >
                    Service
                  </th>
                  <th
                    className="font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap"
                    style={{ width: "10%" }}
                  >
                    Plan
                  </th>
                  <th
                    className={`font-mono text-[9px] text-muted tracking-widest uppercase text-right py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap cursor-pointer ${subSort.key === "price" ? `sort-${subSort.dir}` : ""}`}
                    style={{ width: "9%" }}
                    data-sort="price"
                    onClick={() => handleSubSort("price")}
                  >
                    月額
                  </th>
                  <th
                    className="font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap"
                    style={{ width: "30%" }}
                  >
                    モデル / 機能
                  </th>
                  <th
                    className="font-mono text-[9px] text-muted tracking-widest uppercase text-left py-3.5 px-3.5 border-b border-border bg-surface whitespace-nowrap"
                    style={{ width: "27%" }}
                  >
                    制限・備考
                  </th>
                </tr>
              </thead>
              <tbody id="sub-tbody">
                {sortedSubRows.map((r, i) => (
                  <tr
                    key={r.plan.id}
                    className={`hover:bg-[rgba(0,0,0,.015)] transition-colors${
                      subGaps.has(i) ? " provider-gap" : ""
                    }`}
                    data-provider={r.plan.provider}
                    data-price={r.plan.price}
                  >
                    <td className="py-2.5 px-3.5 border-b border-border align-middle">
                      <span className="flex items-center gap-1.5">
                        <span className={`provider-dot ${r.dotClass}`} />
                        <span className="font-mono text-[10px] text-muted tracking-[.04em]">
                          {r.plan.provider}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 border-b border-border align-middle text-[13px] font-bold text-ink">
                      {r.plan.service}
                    </td>
                    <td className="py-2.5 px-3.5 border-b border-border align-middle">
                      <span className="font-mono text-[10px] tracking-[.04em] px-1.5 py-0.5 rounded-sm text-muted border border-border">
                        {r.plan.planName}
                      </span>
                    </td>
                    <td className="font-mono text-[12px] text-right py-2.5 px-3.5 border-b border-border align-middle whitespace-nowrap">
                      {r.priceStr}
                    </td>
                    <td className="py-2.5 px-3.5 border-b border-border align-middle">
                      <div className="flex gap-1 flex-wrap">
                        {r.modelList.map((model) => (
                          <span
                            key={model}
                            className="font-mono text-[9px] text-ink bg-bg border border-border px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                          >
                            {model}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 border-b border-border align-middle text-[11px] text-muted leading-normal">
                      {r.plan.limits ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SP ソートバー */}
          <div className="hidden max-md:flex items-center gap-1.5 py-2 mt-2">
            <span className="text-[11px] text-muted">並び替え:</span>
            {(["provider", "price"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`sub-sp-sort-btn text-[11px] bg-surface border rounded px-2 py-0.5 cursor-pointer ${
                  subSort.key === key
                    ? "active text-ink border-ink"
                    : "text-muted border-border"
                }`}
                data-sort={key}
                onClick={() => handleSubSort(key)}
              >
                {key === "provider" ? "Provider" : "月額"}
              </button>
            ))}
          </div>

          {/* SP カード */}
          <div className="md:hidden" id="sub-sp">
            {sortedSubRows.map((r, i) => (
              <div
                key={r.plan.id}
                className={`sub-sp-card bg-surface border-b border-border py-2 px-3 flex flex-col gap-1${
                  i === 0 ? " border-t border-t-border" : ""
                }${subGaps.has(i) ? " provider-gap" : ""}`}
                data-provider={r.plan.provider}
                data-price={r.plan.price}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="font-bold text-[12px]">
                      {r.plan.service}
                    </span>
                    <span className="font-mono text-[10px] tracking-[.04em] px-1.5 py-0.5 rounded-sm text-muted border border-border ml-1.5">
                      {r.plan.planName}
                    </span>
                    <br />
                    <span className="font-mono text-[9px] text-muted">
                      <span className={`provider-dot ${r.dotClass}`} />
                      {r.plan.provider}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] whitespace-nowrap shrink-0">
                    {r.priceStr}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {r.modelList.map((model) => (
                    <span
                      key={model}
                      className="font-mono text-[9px] text-ink bg-bg border border-border px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                    >
                      {model}
                    </span>
                  ))}
                </div>
                {r.plan.limits && (
                  <div className="text-[11px] text-muted leading-normal">
                    {r.plan.limits}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 付箋 */}
        {(activeTab === "text" ? apiCommentText : subCommentText) && (
          <div className="mt-7 flex justify-center">
            <div className="relative w-full max-w-150 p-5 pb-6.5 bg-sticky-4 shadow-[3px_5px_12px_rgba(0,0,0,.18),0_1px_3px_rgba(0,0,0,.08)] rotate-[-0.5deg] max-md:rotate-0 max-md:max-w-full">
              <div className="font-mono text-[10px] tracking-[.08em] text-sticky-ink opacity-50 mb-2">
                SUMMARY
              </div>
              <div className="text-[12.5px] leading-[1.9] text-sticky-ink">
                {activeTab === "text" ? apiCommentText : subCommentText}
              </div>
              <div className="sticky-fold max-md:hidden" />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
