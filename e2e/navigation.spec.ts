import { expect, test } from "@playwright/test";
import { gotoWithRetry } from "./helpers";

test.describe("ナビゲーション", () => {
  test("各ページへのナビゲーションリンクが機能する", async ({ page }) => {
    await gotoWithRetry(page, "/");

    // セキュリティへ遷移
    await page.locator("nav >> text=セキュリティ").click();
    await page.waitForURL("**/security");
    await expect(page).toHaveTitle(/セキュリティ/);

    // トレンドへ遷移
    await page.locator("nav >> text=トレンド").click();
    await page.waitForURL("**/trend");
    await expect(page).toHaveTitle(/トレンド/);

    // AI比較へ遷移
    await page.locator("nav >> text=AI比較").click();
    await page.waitForURL("**/ai");
    await expect(page).toHaveTitle(/AI比較/);
  });

  test("各ページのタイトルが正しい", async ({ page }) => {
    const pages = [
      { path: "/", expected: "ニュース" },
      { path: "/security", expected: "セキュリティ" },
      { path: "/trend", expected: "トレンド" },
      { path: "/ai", expected: "AI比較" },
      { path: "/about", expected: "About" },
    ];

    for (const p of pages) {
      await gotoWithRetry(page, p.path);
      await expect(page).toHaveTitle(new RegExp(p.expected));
    }
  });

  test("ハンバーガーメニューが開閉する", async ({ page }) => {
    // SPビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoWithRetry(page, "/");

    const hamburger = page.locator("#hamburger");
    const mobileNav = page.locator("#mobile-nav");

    // 初期状態: 非表示
    await expect(mobileNav).toHaveClass(/hidden/);

    // 開く
    await hamburger.click();
    await expect(mobileNav).not.toHaveClass(/hidden/);
    await expect(hamburger).toHaveAttribute("aria-expanded", "true");

    // 閉じる
    await hamburger.click();
    await expect(mobileNav).toHaveClass(/hidden/);
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  });

  test("aboutページが表示される", async ({ page }) => {
    await gotoWithRetry(page, "/about");
    await expect(page).toHaveTitle(/About/);
  });

  test("ロゴクリックでトップに戻る", async ({ page }) => {
    await gotoWithRetry(page, "/ai");

    await page.locator("header a >> text=ShiranKedo").click();
    await page.waitForURL("**/");
    await expect(page).toHaveTitle(/ニュース/);
  });
});
