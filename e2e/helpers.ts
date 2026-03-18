import { expect, type Locator, type Page } from "@playwright/test";

/** miniflare 初期化待ち対応: エラーページならリトライ */
export async function gotoWithRetry(page: Page, path: string) {
  for (let i = 0; i < 3; i++) {
    await page.goto(path, { waitUntil: "networkidle" });
    const error = await page.locator('text="An error occurred."').count();
    if (error === 0) return;
    await page.waitForTimeout(3000);
  }
  throw new Error("ページの読み込みに失敗しました");
}

/**
 * React Islands (client:idle) のハイドレーション完了を待つ。
 * requestIdleCallback を明示的に発火させてから、クリック→変化確認をリトライ。
 */
export async function clickWhenReady(
  page: Page,
  clickTarget: Locator,
  verifyFn: () => Promise<void>,
  maxRetries = 20,
) {
  for (let i = 0; i < maxRetries; i++) {
    // ブラウザの idle を待つ（requestIdleCallback を発火させる）
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          if ("requestIdleCallback" in window) {
            requestIdleCallback(() => resolve(), { timeout: 1000 });
          } else {
            setTimeout(resolve, 100);
          }
        }),
    );

    await clickTarget.click();
    try {
      await verifyFn();
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  // 最後の試行
  await clickTarget.click();
  await verifyFn();
}
