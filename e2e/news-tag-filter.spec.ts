import { expect, type Page, test } from "@playwright/test";

// miniflare 初期化待ち対応: 最初のリクエストが失敗する場合リトライ
async function gotoWithRetry(page: Page, path: string) {
  for (let i = 0; i < 3; i++) {
    await page.goto(path, { waitUntil: "networkidle" });
    const error = await page.locator('text="An error occurred."').count();
    if (error === 0) return;
    await page.waitForTimeout(3000);
  }
  throw new Error("ページの読み込みに失敗しました");
}

test.describe("ニュースタグフィルタ", () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRetry(page, "/");
    await page.waitForSelector("#news-list > div", { timeout: 15_000 });
  });

  test("タグボタンが表示される", async ({ page }) => {
    const tags = page.locator(".news-tag-filter");
    await expect(tags.first()).toBeVisible();
  });

  test("タグクリックで該当記事のみ表示される", async ({ page }) => {
    // 最初のタグを取得
    const firstTag = page.locator(".news-tag-filter").first();
    const tagName = await firstTag.getAttribute("data-tag");
    expect(tagName).toBeTruthy();

    await firstTag.click();

    // フィルタ解除ボタンが表示される
    const resetButton = page.locator("#filter-reset");
    await expect(resetButton).toBeVisible();

    // 表示中の記事は全て該当タグを持つ
    const visibleCards = page.locator(
      '#news-list > div:not([style*="display: none"])',
    );
    const count = await visibleCards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const tagsAttr = await visibleCards.nth(i).getAttribute("data-tags");
      expect(tagsAttr).toBeTruthy();
      const tags: string[] = JSON.parse(tagsAttr!);
      expect(tags).toContain(tagName);
    }

    // 非表示の記事は該当タグを持たない
    const hiddenCards = page.locator(
      '#news-list > div[style*="display: none"]',
    );
    const hiddenCount = await hiddenCards.count();
    for (let i = 0; i < hiddenCount; i++) {
      const tagsAttr = await hiddenCards.nth(i).getAttribute("data-tags");
      if (tagsAttr) {
        const tags: string[] = JSON.parse(tagsAttr);
        expect(tags).not.toContain(tagName);
      }
    }
  });

  test("フィルタ解除で全記事が初期状態に戻る", async ({ page }) => {
    // 初期状態の表示記事数を記録
    const initialVisible = await page
      .locator("#news-list > div:not(.news-hidden)")
      .count();

    // タグでフィルタ
    const firstTag = page.locator(".news-tag-filter").first();
    await firstTag.click();

    const resetButton = page.locator("#filter-reset");
    await expect(resetButton).toBeVisible();

    // フィルタ解除
    await resetButton.click();

    // フィルタ解除ボタンが非表示になる
    await expect(resetButton).toBeHidden();

    // 初期状態の表示数に戻る
    const afterResetVisible = await page
      .locator("#news-list > div:not(.news-hidden)")
      .count();
    expect(afterResetVisible).toBe(initialVisible);
  });

  test("もっと見るボタンで追加記事が表示される", async ({ page }) => {
    const loadMore = page.locator("#load-more");

    // もっと見るボタンが存在する場合のみテスト
    if (await loadMore.isVisible()) {
      const beforeCount = await page
        .locator("#news-list > div:not(.news-hidden)")
        .count();

      await loadMore.click();

      const afterCount = await page
        .locator("#news-list > div:not(.news-hidden)")
        .count();

      expect(afterCount).toBeGreaterThan(beforeCount);
    }
  });

  test("異なるタグを連続クリックでフィルタが切り替わる", async ({ page }) => {
    const tags = page.locator(".news-tag-filter");
    const tagCount = await tags.count();

    if (tagCount < 2) {
      test.skip();
      return;
    }

    // 最初のタグでフィルタ
    const firstTag = tags.first();
    const firstTagName = await firstTag.getAttribute("data-tag");
    await firstTag.click();

    // 別のタグ名を持つタグを探してクリック
    let secondTagName: string | null = null;
    for (let i = 1; i < tagCount; i++) {
      const name = await tags.nth(i).getAttribute("data-tag");
      if (name !== firstTagName) {
        secondTagName = name;
        // そのタグが表示されている記事内にあるか確認
        const visibleTag = page.locator(
          `#news-list > div:not([style*="display: none"]) .news-tag-filter[data-tag="${name}"]`,
        );
        if ((await visibleTag.count()) > 0) {
          await visibleTag.first().click();
          break;
        }
      }
    }

    if (!secondTagName) return;

    // 2番目のフィルタが適用されている
    const visibleCards = page.locator(
      '#news-list > div:not([style*="display: none"])',
    );
    const secondFilterCount = await visibleCards.count();
    expect(secondFilterCount).toBeGreaterThan(0);

    // 表示中の記事は2番目のタグを持つ
    for (let i = 0; i < secondFilterCount; i++) {
      const tagsAttr = await visibleCards.nth(i).getAttribute("data-tags");
      const parsedTags: string[] = JSON.parse(tagsAttr!);
      expect(parsedTags).toContain(secondTagName);
    }
  });
});
