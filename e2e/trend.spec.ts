import { expect, type Page, test } from "@playwright/test";

async function gotoWithRetry(page: Page, path: string) {
  for (let i = 0; i < 3; i++) {
    await page.goto(path, { waitUntil: "networkidle" });
    const error = await page.locator('text="An error occurred."').count();
    if (error === 0) return;
    await page.waitForTimeout(3000);
  }
  throw new Error("ページの読み込みに失敗しました");
}

test.describe("トレンドページ", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRetry(page, "/trend");
  });

  test("ランキングテーブルが表示される", async ({ page }) => {
    const table = page.locator('table[aria-label="トレンドリポジトリ"]');
    await expect(table).toBeVisible();

    const rows = page.locator("#trend-tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("もっと見るで追加行が表示される", async ({ page }) => {
    const moreButton = page.locator("#trend-more");
    if (!(await moreButton.isVisible())) return;

    // 初期表示: trend-hidden でない行
    const visibleBefore = await page
      .locator("#trend-tbody tr:not(.trend-hidden)")
      .count();

    await moreButton.click();

    // クリック後: display: table-row に変わった行が増える
    await page.waitForTimeout(300);
    const visibleAfter = await page
      .locator(
        '#trend-tbody tr:not(.trend-hidden), #trend-tbody tr[style*="table-row"]',
      )
      .count();

    expect(visibleAfter).toBeGreaterThan(visibleBefore);
  });

  test("NEWバッジが表示される", async ({ page }) => {
    // trend テーブル内の NEW バッジ（bg-accent クラスの span）
    const newBadges = page.locator("#trend-tbody span.bg-accent");
    if ((await newBadges.count()) > 0) {
      await expect(newBadges.first()).toBeVisible();
      const text = await newBadges.first().textContent();
      expect(text?.trim()).toBe("NEW");
    }
  });

  test("リポジトリに説明文が表示される", async ({ page }) => {
    const descriptions = page.locator("#trend-tbody td .text-muted.ml-2");
    if ((await descriptions.count()) > 0) {
      const text = await descriptions.first().textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });
});
