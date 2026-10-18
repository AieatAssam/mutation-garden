import { expect, test } from '@playwright/test';

test('renders responsive garden framing without browser errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize(testInfo.project.name === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-render.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');
  const canvas = page.locator('#stage');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);
  const screenshot = testInfo.project.name === 'desktop'
    ? 'docs/art/evidence/m1-07b1a-desktop-1280x800.png'
    : 'docs/art/evidence/m1-07b1a-phone-390x844.png';
  await page.screenshot({ path: screenshot, fullPage: true });
  expect(errors).toEqual([]);
});
