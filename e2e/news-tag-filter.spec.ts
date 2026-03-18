import { expect, test } from "@playwright/test";
import { gotoWithRetry } from "./helpers";

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
    const firstTag = page.locator(".news-tag-filter").first();
    const tagName = await firstTag.getAttribute("data-tag");
    expect(tagName).toBeTruthy();

    await firstTag.click();

    const resetButton = page.locator("#filter-reset");
    await expect(resetButton).toBeVisible();

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
    const initialVisible = await page
      .locator("#news-list > div:not(.news-hidden)")
      .count();

    const firstTag = page.locator(".news-tag-filter").first();
    await firstTag.click();

    const resetButton = page.locator("#filter-reset");
    await expect(resetButton).toBeVisible();

    await resetButton.click();

    await expect(resetButton).toBeHidden();

    const afterResetVisible = await page
      .locator("#news-list > div:not(.news-hidden)")
      .count();
    expect(afterResetVisible).toBe(initialVisible);
  });

  test("もっと見るボタンで追加記事が表示される", async ({ page }) => {
    const loadMore = page.locator("#load-more");

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

    const firstTag = tags.first();
    const firstTagName = await firstTag.getAttribute("data-tag");
    await firstTag.click();

    let secondTagName: string | null = null;
    for (let i = 1; i < tagCount; i++) {
      const name = await tags.nth(i).getAttribute("data-tag");
      if (name !== firstTagName) {
        secondTagName = name;
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

    const visibleCards = page.locator(
      '#news-list > div:not([style*="display: none"])',
    );
    const secondFilterCount = await visibleCards.count();
    expect(secondFilterCount).toBeGreaterThan(0);

    for (let i = 0; i < secondFilterCount; i++) {
      const tagsAttr = await visibleCards.nth(i).getAttribute("data-tags");
      const parsedTags: string[] = JSON.parse(tagsAttr!);
      expect(parsedTags).toContain(secondTagName);
    }
  });
});
