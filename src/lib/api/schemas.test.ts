import { describe, expect, it } from "vitest";
import {
  articleSchema,
  dailyArticlesSchema,
  llmModelSchema,
  pageCommentSchema,
  releaseSchema,
  repoStatSchema,
  securityDailySchema,
  subscriptionPlanSchema,
  trackingRepoSchema,
  vulnerabilitySchema,
  weeklySummarySchema,
} from "./schemas";

describe("articleSchema", () => {
  const valid = {
    url: "https://example.com/article",
    title: "テスト記事",
    source: "hackernews",
    summary: "要約",
    comment: "コメント",
    tags: ["AI", "Rust"],
    impact: 8,
    publishedAt: "2026-03-15",
  };

  it("有効なデータをパースできる", () => {
    const result = articleSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      // tags は JSON.stringify される
      expect(result.data.tags).toBe('["AI","Rust"]');
    }
  });

  it("isPaper のデフォルトは 0", () => {
    const result = articleSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPaper).toBe(0);
    }
  });

  it("isPaper を 1 に設定できる", () => {
    const result = articleSchema.safeParse({ ...valid, isPaper: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPaper).toBe(1);
    }
  });

  it("url が空文字でエラー", () => {
    const result = articleSchema.safeParse({ ...valid, url: "" });
    expect(result.success).toBe(false);
  });

  it("impact が範囲外でエラー", () => {
    expect(articleSchema.safeParse({ ...valid, impact: 0 }).success).toBe(
      false,
    );
    expect(articleSchema.safeParse({ ...valid, impact: 11 }).success).toBe(
      false,
    );
  });
});

describe("dailyArticlesSchema", () => {
  it("配列をラップしてパースできる", () => {
    const result = dailyArticlesSchema.safeParse([
      {
        url: "https://example.com/1",
        title: "記事1",
        source: "zenn",
        summary: "要約",
        comment: "コメ",
        tags: ["Web"],
        impact: 5,
        publishedAt: "2026-03-15",
      },
    ]);
    expect(result.success).toBe(true);
  });
});

describe("vulnerabilitySchema", () => {
  it("有効なデータをパースできる", () => {
    const result = vulnerabilitySchema.safeParse({
      cveId: "CVE-2026-12345",
      title: "脆弱性タイトル",
      cvssScore: 9.8,
      publishedAt: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });

  it("cvssScore は省略可能", () => {
    const result = vulnerabilitySchema.safeParse({
      cveId: "CVE-2026-12345",
      title: "脆弱性",
      publishedAt: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });
});

describe("releaseSchema", () => {
  it("有効なデータをパースできる", () => {
    const result = releaseSchema.safeParse({
      repo: "facebook/react",
      tag: "v19.0.0",
      version: "19.0.0",
      type: "major",
      publishedAt: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });

  it("type が major/minor 以外でエラー", () => {
    const result = releaseSchema.safeParse({
      repo: "facebook/react",
      tag: "v19.0.0",
      version: "19.0.0",
      type: "patch",
      publishedAt: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });
});

describe("securityDailySchema", () => {
  it("vulnIds と releaseIds は JSON 文字列に変換される", () => {
    const result = securityDailySchema.safeParse({
      comment: "今日のまとめ",
      vulnIds: ["CVE-2026-001"],
      releaseIds: [1, 2],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vulnIds).toBe('["CVE-2026-001"]');
      expect(result.data.releaseIds).toBe("[1,2]");
    }
  });
});

describe("trackingRepoSchema", () => {
  it("有効なデータをパースできる", () => {
    const result = trackingRepoSchema.safeParse({
      repo: "vercel/next.js",
      displayName: "Next.js",
      description: "Reactフレームワーク",
      language: "TypeScript",
    });
    expect(result.success).toBe(true);
  });

  it("description と language は省略可能", () => {
    const result = trackingRepoSchema.safeParse({
      repo: "vercel/next.js",
      displayName: "Next.js",
    });
    expect(result.success).toBe(true);
  });
});

describe("repoStatSchema", () => {
  it("有効なデータをパースできる", () => {
    const result = repoStatSchema.safeParse({
      repo: "vercel/next.js",
      stars: 130000,
    });
    expect(result.success).toBe(true);
  });
});

describe("llmModelSchema", () => {
  it("有効なデータをパースできる", () => {
    const result = llmModelSchema.safeParse({
      modelName: "claude-opus-4-6",
      provider: "anthropic",
      score: 95.2,
      inputPrice: 15.0,
      outputPrice: 75.0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("USD");
    }
  });
});

describe("subscriptionPlanSchema", () => {
  it("models を JSON 文字列に変換する", () => {
    const result = subscriptionPlanSchema.safeParse({
      provider: "Anthropic",
      service: "Claude",
      planName: "Pro",
      price: 20,
      models: ["claude-opus-4-6", "claude-sonnet-4-6"],
      limits: "無制限",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.models).toBe(
        '["claude-opus-4-6","claude-sonnet-4-6"]',
      );
    }
  });
});

describe("weeklySummarySchema", () => {
  it("content のみで有効", () => {
    const result = weeklySummarySchema.safeParse({
      content: "今週のまとめ",
    });
    expect(result.success).toBe(true);
  });
});

describe("pageCommentSchema", () => {
  it("有効な type でパースできる", () => {
    for (const type of ["trend", "ai_api", "ai_sub"]) {
      const result = pageCommentSchema.safeParse({
        type,
        content: "コメント内容",
      });
      expect(result.success).toBe(true);
    }
  });

  it("不正な type でエラー", () => {
    const result = pageCommentSchema.safeParse({
      type: "invalid",
      content: "コメント",
    });
    expect(result.success).toBe(false);
  });
});
