import { expect, test } from "@playwright/test";
import { clickWhenReady, gotoWithRetry } from "./helpers";

/** 脆弱性タブに切り替えてハイドレーション完了を確認 */
async function switchToVulnsTab(page: import("@playwright/test").Page) {
  const vulnsBtn = page.locator(".tab-btn", { hasText: "脆弱性" });
  await clickWhenReady(page, vulnsBtn, async () => {
    await expect(page.locator("#tab-vulns")).not.toHaveClass(/hidden/, {
      timeout: 500,
    });
  });
}

/** アップデートタブに切り替えてハイドレーション完了を確認 */
async function switchToUpdatesTab(page: import("@playwright/test").Page) {
  const updatesBtn = page.locator(".tab-btn", { hasText: "アップデート" });
  await clickWhenReady(page, updatesBtn, async () => {
    await expect(page.locator("#tab-updates")).not.toHaveClass(/hidden/, {
      timeout: 500,
    });
  });
}

test.describe("セキュリティページ", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRetry(page, "/security");
  });

  test("日次サマリータブがデフォルトで表示される", async ({ page }) => {
    await expect(page.locator("#tab-summary")).not.toHaveClass(/hidden/);
  });

  test("脆弱性タブに切り替わりカードが表示される", async ({ page }) => {
    await switchToVulnsTab(page);

    const cards = page.locator(".vuln-card:not(.vuln-hidden)");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("アップデートタブに切り替わりカードが表示される", async ({ page }) => {
    await switchToUpdatesTab(page);

    const cards = page.locator(".update-card:not(.update-hidden)");
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test("脆弱性のもっと見るで追加表示される", async ({ page }) => {
    await switchToVulnsTab(page);

    const moreButton = page.locator("#vuln-more");
    if (!(await moreButton.isVisible())) return;

    const beforeCount = await page
      .locator(".vuln-card:not(.vuln-hidden)")
      .count();

    await moreButton.click();

    await expect(page.locator(".vuln-card:not(.vuln-hidden)")).not.toHaveCount(
      beforeCount,
    );

    const afterCount = await page
      .locator(".vuln-card:not(.vuln-hidden)")
      .count();
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test("アップデートのもっと見るは脆弱性と独立して動作する", async ({
    page,
  }) => {
    // 脆弱性タブで「もっと見る」をクリック
    await switchToVulnsTab(page);

    const vulnMore = page.locator("#vuln-more");
    if (await vulnMore.isVisible()) {
      await vulnMore.click();
    }

    // アップデートタブに切り替え → 初期表示は10件のまま
    await switchToUpdatesTab(page);

    const updateCount = await page
      .locator(".update-card:not(.update-hidden)")
      .count();
    expect(updateCount).toBeLessThanOrEqual(10);
  });

  test("検索でフィルタされる", async ({ page }) => {
    await switchToVulnsTab(page);

    const searchInput = page.locator(
      '#tab-vulns input[aria-label="CVE ID やキーワードで脆弱性を検索"]',
    );
    await expect(searchInput).toBeVisible();

    const beforeCount = await page.locator(".vuln-card").count();

    const firstCve = await page
      .locator(".vuln-card .font-medium")
      .first()
      .textContent();
    if (!firstCve) return;

    await searchInput.fill(firstCve);

    const afterCount = await page.locator(".vuln-card").count();
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
    expect(afterCount).toBeGreaterThan(0);
  });

  test("検索クリアで元に戻る", async ({ page }) => {
    await switchToVulnsTab(page);

    const searchInput = page.locator(
      '#tab-vulns input[aria-label="CVE ID やキーワードで脆弱性を検索"]',
    );
    await expect(searchInput).toBeVisible();

    const initialCount = await page.locator(".vuln-card").count();

    await searchInput.fill("CVE-9999-99999");
    await expect(page.locator(".vuln-card")).toHaveCount(0);

    await searchInput.fill("");
    await expect(page.locator(".vuln-card")).toHaveCount(initialCount);
  });

  test("MAJORバッジが表示される", async ({ page }) => {
    const majorBadges = page.getByText("MAJOR");
    if ((await majorBadges.count()) > 0) {
      await expect(majorBadges.first()).toBeVisible();
    }
  });
});
