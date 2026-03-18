// アプリ全体で使う定数

/** NEW リポジトリ判定の閾値（日数） */
export const NEW_REPO_DAYS = 7;

/** 相対日時表示の閾値（日数）。超過すると日付文字列を表示 */
export const RELATIVE_DATE_DAYS = 7;

/** トレンドページのstar推移データ取得期間（日数） */
export const TREND_LOOKBACK_DAYS = 15;

/** スコア時間減衰率（1日あたり15%減衰） */
export const DECAY_RATE = 0.85;

/** メジャーリリースのスコア倍率 */
export const MAJOR_RELEASE_MULTIPLIER = 2;

/** 「もっと見る」のページング単位 */
export const PAGE_STEP = 10;

/** 為替レート JPY/USD のフォールバック値 */
export const JPY_PER_USD_FALLBACK = 150;

/** 為替レート JPY/EUR のフォールバック値 */
export const JPY_PER_EUR_FALLBACK = 163;
