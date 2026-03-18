import { DECAY_RATE, MAJOR_RELEASE_MULTIPLIER } from "./constants";

/** 日付文字列から経過日数を算出（0以上） */
function daysSince(publishedAt: string, now: Date = new Date()): number {
  const pub = new Date(publishedAt);
  const diffMs = now.getTime() - pub.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** ニュース記事の時間減衰スコア: impact × DECAY_RATE^(経過日数) */
export function articleDecayScore(
  impact: number,
  publishedAt: string,
  now?: Date,
): number {
  return impact * DECAY_RATE ** daysSince(publishedAt, now);
}

/** 脆弱性の時間減衰スコア: cvssScore × DECAY_RATE^(経過日数) */
export function vulnDecayScore(
  cvssScore: number | null,
  publishedAt: string,
  now?: Date,
): number {
  if (cvssScore == null) return 0;
  return cvssScore * DECAY_RATE ** daysSince(publishedAt, now);
}

/** リリースの時間減衰スコア: stars × (major倍率) × DECAY_RATE^(経過日数) */
export function releaseDecayScore(
  stars: number,
  type: string,
  publishedAt: string,
  now?: Date,
): number {
  const multiplier = type === "major" ? MAJOR_RELEASE_MULTIPLIER : 1;
  return stars * multiplier * DECAY_RATE ** daysSince(publishedAt, now);
}
