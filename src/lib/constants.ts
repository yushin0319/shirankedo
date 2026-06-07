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

/**
 * トップページで D1 から取得する記事の母集団上限（CPU 上限ガード）。
 * 全件 SELECT は記事増加で fetch ハンドラの CPU 枠を超過し exceededCpu に
 * なるため上限を設ける。impact は 4〜10 に収まり decayScore=impact×0.85^days。
 * 上位 FETCH_LIMIT(50) 件に入るには impact 最大10でも約10日以内が必要
 * （10×0.85^10≈1.97 が表示下限付近）。QUERY_WINDOW_DAYS と併用し漏れを防ぐ。
 */
export const QUERY_LIMIT = 300;

/**
 * トップページの記事取得対象期間（日数）。これより古い記事は decay でスコアが
 * 実質ゼロ（impact最大10×0.85^45 ≈ 0.007 ≪ 上位50件の最小スコア 1.9 前後）に
 * なり top FETCH_LIMIT 件へ入り得ないため除外する。decay 漏れ防止の明示ガード兼、
 * 母集団を絞って CPU を削減する。記事頻度が将来増えても日数固定で安全側に働く。
 */
export const QUERY_WINDOW_DAYS = 45;

/** フロント表示の上限件数（これ以上は「もっと見る」を出さない） */
export const DISPLAY_CAP = 100;

/** 為替レート JPY/USD のフォールバック値 */
export const JPY_PER_USD_FALLBACK = 150;

/** 為替レート JPY/EUR のフォールバック値 */
export const JPY_PER_EUR_FALLBACK = 163;
