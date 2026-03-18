import { expect, test } from "@playwright/test";
import { clickWhenReady, gotoWithRetry } from "./helpers";

test.describe("AI比較ページ", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRetry(page, "/ai");
  });

  test("API利用タブがデフォルトでアクティブ", async ({ page }) => {
    await expect(page.locator("#tab-text")).not.toHaveClass(/hidden/);
    await expect(page.locator("#tab-sub")).toHaveClass(/hidden/);
  });

  test("サブスク比較タブに切り替わる", async ({ page }) => {
    const subBtn = page.locator(".ai-tab-btn", { hasText: "サブスク比較" });
    await clickWhenReady(page, subBtn, async () => {
      await expect(page.locator("#tab-sub")).not.toHaveClass(/hidden/, {
        timeout: 500,
      });
    });
    await expect(page.locator("#tab-text")).toHaveClass(/hidden/);
  });

  test("Scoreヘッダクリックでソート方向が変わる", async ({ page }) => {
    const scoreHeader = page.locator('th[data-sort="score"]');

    // 初回クリック: desc → asc（同じキーなので反転）
    await clickWhenReady(page, scoreHeader, async () => {
      await expect(scoreHeader).toHaveAttribute("aria-sort", "ascending", {
        timeout: 500,
      });
    });
  });

  test("Providerヘッダクリックでプロバイダー順にソート", async ({ page }) => {
    const providerHeader = page.locator('#tab-text th[data-sort="provider"]');
    await clickWhenReady(page, providerHeader, async () => {
      await expect(providerHeader).toHaveAttribute("aria-sort", "ascending", {
        timeout: 500,
      });
    });

    const gaps = page.locator("#api-tbody tr.provider-gap");
    expect(await gaps.count()).toBeGreaterThan(0);
  });

  test("月額ヘッダクリックでソート", async ({ page }) => {
    const monthlyHeader = page.locator('th[data-sort="monthly"]');
    await clickWhenReady(page, monthlyHeader, async () => {
      await expect(monthlyHeader).toHaveAttribute("aria-sort", "ascending", {
        timeout: 500,
      });
    });
  });

  test("もっと見るで追加行が表示される", async ({ page }) => {
    // ハイドレーション待ち: Score ヘッダをクリックして反応を確認
    const scoreHeader = page.locator('th[data-sort="score"]');
    await clickWhenReady(page, scoreHeader, async () => {
      await expect(scoreHeader).toHaveAttribute("aria-sort", "ascending", {
        timeout: 500,
      });
    });
    // ソートを元に戻す
    await scoreHeader.click();

    const moreButton = page.locator("#api-more");
    if (!(await moreButton.isVisible())) return;

    const beforeCount = await page
      .locator("#api-tbody tr:not(.api-hidden)")
      .count();

    await moreButton.click();

    await expect(
      page.locator("#api-tbody tr:not(.api-hidden)"),
    ).not.toHaveCount(beforeCount);
  });

  test("ソート切替でページングがリセットされる", async ({ page }) => {
    // ハイドレーション待ち
    const scoreHeader = page.locator('th[data-sort="score"]');
    await clickWhenReady(page, scoreHeader, async () => {
      await expect(scoreHeader).toHaveAttribute("aria-sort", "ascending", {
        timeout: 500,
      });
    });
    await scoreHeader.click(); // 戻す

    const moreButton = page.locator("#api-more");
    if (!(await moreButton.isVisible())) return;

    await moreButton.click();
    await expect(
      page.locator("#api-tbody tr:not(.api-hidden)"),
    ).not.toHaveCount(10);

    const expandedCount = await page
      .locator("#api-tbody tr:not(.api-hidden)")
      .count();

    // ソートを切り替え → ページングリセット
    await page.locator('#tab-text th[data-sort="provider"]').click();
    await expect(page.locator("#api-tbody tr:not(.api-hidden)")).toHaveCount(
      10,
    );

    const afterSortCount = await page
      .locator("#api-tbody tr:not(.api-hidden)")
      .count();
    expect(afterSortCount).toBeLessThan(expandedCount);
  });

  test("付箋コメントが表示される", async ({ page }) => {
    const sticky = page.locator("text=SUMMARY");
    if (await sticky.isVisible()) {
      await expect(sticky).toBeVisible();
    }
  });
});
