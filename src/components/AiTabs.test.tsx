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

  describe("全件表示", () => {
    it("全モデルが初期表示される", () => {
      render(<AiTabs {...defaultProps} models={makeModels(25)} />);
      const tbody = document.getElementById("api-tbody");
      const rows = tbody?.querySelectorAll("tr") ?? [];
      expect(rows.length).toBe(25);
      expect(screen.queryByText("+ もっと見る")).not.toBeInTheDocument();
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

    it("USDプランがjpyPerUsdで円換算表示される", async () => {
      const user = userEvent.setup();
      const plans = [
        {
          id: 1,
          provider: "OpenAI",
          service: "ChatGPT",
          planName: "Plus",
          price: 20,
          currency: "USD",
          models: JSON.stringify(["GPT-4o"]),
          limits: null,
          createdAt: "2026-01-01",
          updatedAt: null,
        },
      ];
      render(<AiTabs {...defaultProps} plans={plans} jpyPerUsd={148} />);

      await user.click(screen.getByRole("button", { name: "サブスク比較" }));

      // $20 × 148 = ¥2,960
      const tbody = document.getElementById("sub-tbody");
      expect(tbody?.textContent).toContain("¥2,960");
    });

    it("EURプランがjpyPerEurで円換算表示される", async () => {
      const user = userEvent.setup();
      const plans = [
        {
          id: 1,
          provider: "Mistral",
          service: "Le Chat",
          planName: "Pro",
          price: 14.99,
          currency: "EUR",
          models: JSON.stringify(["Mistral Large"]),
          limits: null,
          createdAt: "2026-01-01",
          updatedAt: null,
        },
      ];
      render(
        <AiTabs
          {...defaultProps}
          plans={plans}
          jpyPerUsd={148}
          jpyPerEur={162}
        />,
      );

      await user.click(screen.getByRole("button", { name: "サブスク比較" }));

      // €14.99 × 162 = ¥2,428
      const tbody = document.getElementById("sub-tbody");
      expect(tbody?.textContent).toContain("¥2,428");
    });

    it("JPYプランはそのまま円表示される", async () => {
      const user = userEvent.setup();
      const plans = [
        {
          id: 1,
          provider: "Google",
          service: "Gemini",
          planName: "Advanced",
          price: 2900,
          currency: "JPY",
          models: JSON.stringify(["Gemini"]),
          limits: null,
          createdAt: "2026-01-01",
          updatedAt: null,
        },
      ];
      render(<AiTabs {...defaultProps} plans={plans} jpyPerUsd={148} />);

      await user.click(screen.getByRole("button", { name: "サブスク比較" }));

      const tbody = document.getElementById("sub-tbody");
      expect(tbody?.textContent).toContain("¥2,900");
    });
  });
});
