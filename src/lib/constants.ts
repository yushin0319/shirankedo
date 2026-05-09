// アプリ全体で使う定数

/** NEW リポジトリ判定の閾値（日数） */
export const NEW_REPO_DAYS = 7;

/** 相対日時表示の閾値（日数）。超過すると日付文字列を表示 */
export const RELATIVE_DATE_DAYS = 7;

/** トレンドページのstar推移データ取得期間（日数） */
export const TREND_LOOKBACK_DAYS = 12;

/** トレンドdiff算出の時間窓（時間）。最新スナップからこの範囲内の最古を前回分とする */
export const TREND_DIFF_WINDOW_HOURS = 7 * 24 + 5; // 173時間

/** スコア時間減衰率（1日あたり15%減衰） */
export const DECAY_RATE = 0.85;

/** 「もっと見る」のページング単位 */
export const PAGE_STEP = 10;

/** サーバー側データ取得の上限件数 */
export const FETCH_LIMIT = 50;

/** フロント表示の上限件数（これ以上は「もっと見る」を出さない） */
export const DISPLAY_CAP = 100;

/** 為替レート JPY/USD のフォールバック値 */
export const JPY_PER_USD_FALLBACK = 150;

/** 為替レート JPY/EUR のフォールバック値 */
export const JPY_PER_EUR_FALLBACK = 163;
