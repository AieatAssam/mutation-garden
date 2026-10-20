import { expect, test } from '@playwright/test';

test('renders six occupied plot status descriptors in five draw calls', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  if (testInfo.project.name === 'mobile-portrait') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/plot-status.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');
  await expect(page.locator('body')).toHaveAttribute('data-status-delta', '5');
  await expect(page.locator('body')).toHaveAttribute('data-status-budget', '5');
  const stampCssSize = Number(await page.locator('body').getAttribute('data-stamp-css-size'));
  expect(stampCssSize).toBeGreaterThanOrEqual(26);
  expect(stampCssSize).toBeLessThanOrEqual(30);
  expect(errors).toEqual([]);
});
