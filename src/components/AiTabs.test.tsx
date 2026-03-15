import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AiTabs } from "./AiTabs";

afterEach(cleanup);

// テスト用データ: 12件のモデル（もっと見るテスト用に10超）
function makeModels(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    modelName: `model-${i}`,
    provider: i % 3 === 0 ? "OpenAI" : i % 3 === 1 ? "Anthropic" : "Google",
    score: 50 - i,
    inputPrice: 1 + i * 0.5,
    outputPrice: 2 + i * 0.5,
    currency: "USD",
    createdAt: "2026-01-01",
    updatedAt: null,
  }));
}

function makePlans(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    provider: i % 2 === 0 ? "OpenAI" : "Anthropic",
    service: `Service-${i}`,
    planName: `Plan-${i}`,
    price: (i + 1) * 1000,
    currency: i % 2 === 0 ? "JPY" : "USD",
    models: JSON.stringify([`model-a-${i}`, `model-b-${i}`]),
    limits: i % 2 === 0 ? `Limit-${i}` : null,
    createdAt: "2026-01-01",
    updatedAt: null,
  }));
}

const providerDotClass: Record<string, string> = {
  OpenAI: "dot-openai",
  Anthropic: "dot-anthropic",
  Google: "dot-google",
};

const defaultProps = {
  models: makeModels(12),
  plans: makePlans(4),
  commentText: "テストコメント",
  providerDotClass,
};

describe("AiTabs", () => {
  describe("タブ切り替え", () => {
    it("初期表示で「API利用」タブがアクティブ", () => {
      render(<AiTabs {...defaultProps} />);
      const apiTab = screen.getByRole("button", { name: "API利用" });
      expect(apiTab).toHaveClass("active");
      const apiPanel = document.getElementById("tab-text");
      expect(apiPanel).not.toHaveClass("hidden");
    });

    it("「サブスク比較」クリックでタブ切り替え", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "サブスク比較" }));

      const subPanel = document.getElementById("tab-sub");
      expect(subPanel).not.toHaveClass("hidden");
      const apiPanel = document.getElementById("tab-text");
      expect(apiPanel).toHaveClass("hidden");
    });

    it("API利用に戻れる", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "サブスク比較" }));
      await user.click(screen.getByRole("button", { name: "API利用" }));

      const apiPanel = document.getElementById("tab-text");
      expect(apiPanel).not.toHaveClass("hidden");
    });
  });

  describe("もっと見る", () => {
    it("11件目以降が非表示", () => {
      render(<AiTabs {...defaultProps} />);
      const tbody = document.getElementById("api-tbody");
      const rows = tbody?.querySelectorAll("tr") ?? [];
      const visibleRows = Array.from(rows).filter(
        (r) => !r.classList.contains("api-hidden"),
      );
      expect(visibleRows.length).toBe(10);
    });

    it("「もっと見る」クリックで全件表示", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      await user.click(screen.getByText("+ もっと見る"));

      const tbody = document.getElementById("api-tbody");
      const hiddenRows = tbody?.querySelectorAll("tr.api-hidden") ?? [];
      expect(hiddenRows.length).toBe(0);
    });

    it("「閉じる」クリックで10件に戻る", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      await user.click(screen.getByText("+ もっと見る"));
      await user.click(screen.getByText("- 閉じる"));

      const tbody = document.getElementById("api-tbody");
      const hiddenRows = tbody?.querySelectorAll("tr.api-hidden") ?? [];
      expect(hiddenRows.length).toBe(2);
    });
  });

  describe("ソート", () => {
    it("初期表示は score desc 順", () => {
      render(<AiTabs {...defaultProps} />);
      const tbody = document.getElementById("api-tbody");
      const firstRow = tbody?.querySelector("tr");
      expect(firstRow?.textContent).toContain("model-0");
    });

    it("Provider ヘッダークリックで並び替え", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      const providerHeader = document.querySelector(
        '#tab-text th[data-sort="provider"]',
      );
      await user.click(providerHeader!);

      const tbody = document.getElementById("api-tbody");
      const firstRow = tbody?.querySelector("tr");
      expect(firstRow?.textContent).toContain("Anthropic");
    });

    it("provider ソート時に gap クラスがつく", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      const providerHeader = document.querySelector(
        '#tab-text th[data-sort="provider"]',
      );
      await user.click(providerHeader!);

      const tbody = document.getElementById("api-tbody");
      const gapRows = tbody?.querySelectorAll("tr.provider-gap") ?? [];
      expect(gapRows.length).toBeGreaterThan(0);
    });
  });

  describe("サブスクタブ", () => {
    it("provider/price ソートが機能する", async () => {
      const user = userEvent.setup();
      render(<AiTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "サブスク比較" }));

      const priceHeader = document.querySelector(
        '#tab-sub th[data-sort="price"]',
      );
      await user.click(priceHeader!);

      const tbody = document.getElementById("sub-tbody");
      expect(tbody?.querySelectorAll("tr").length).toBe(4);
    });
  });

  describe("付箋", () => {
    it("commentText があるとき表示される", () => {
      render(<AiTabs {...defaultProps} />);
      expect(screen.getByText("テストコメント")).toBeInTheDocument();
    });

    it("commentText null のとき非表示", () => {
      render(<AiTabs {...defaultProps} commentText={null} />);
      expect(screen.queryByText("テストコメント")).not.toBeInTheDocument();
    });
  });
});
