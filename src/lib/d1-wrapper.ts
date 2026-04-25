/**
 * D1 クエリラッパー (M10).
 *
 * ## 目的
 *
 * `db.select()` / `env.DB.prepare()` を直接呼ぶ代わりに `queryD1(label, fn)` 経由にして:
 *
 * 1. duration_ms を計測
 * 2. 例外を必ず明示的に throw（D1 の transient failure を握りつぶさない）
 * 3. console.log で構造化 JSON を吐く（observability=true で Dashboard 検索可）
 * 4. 空配列と接続失敗を区別
 *
 * ## 使い方
 *
 * ```ts
 * import { queryD1 } from "@/lib/d1-wrapper";
 *
 * const rows = await queryD1("articles.list", () =>
 *   db.select().from(articles)
 * );
 * ```
 *
 * ## ログ形式
 *
 * - 成功:  `{type:"d1_query", label, duration_ms, status:"ok", row_count}`
 * - 失敗:  `{type:"d1_query", label, duration_ms, status:"error", error}`
 *
 * Workers Dashboard の Logs で `type=d1_query` で絞り込み、`label` で個別クエリの
 * P95 / エラー率を観測できる。
 */

export type D1QueryFn<T> = () => Promise<T>;

/**
 * D1 クエリ実行をラップして観測可能にする。
 *
 * @param label   クエリの論理名（"articles.list" 等、ドット区切りで grep しやすく）
 * @param fn      実際の D1 呼び出し（drizzle / raw 両対応）
 */
export async function queryD1<T>(label: string, fn: D1QueryFn<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration_ms = Math.round(performance.now() - start);
    let row_count: number | null = null;
    if (Array.isArray(result)) {
      row_count = result.length;
    } else if (result == null) {
      row_count = 0;
    } else if (typeof result === "object") {
      // D1 raw response: { results: [...], success: true, meta: {...} }
      const maybeResults = (result as Record<string, unknown>).results;
      if (Array.isArray(maybeResults)) {
        row_count = maybeResults.length;
      }
    }
    console.log(
      JSON.stringify({
        type: "d1_query",
        label,
        duration_ms,
        status: "ok",
        row_count,
      }),
    );
    return result;
  } catch (err) {
    const duration_ms = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        type: "d1_query",
        label,
        duration_ms,
        status: "error",
        error: message,
      }),
    );
    throw err;
  }
}
