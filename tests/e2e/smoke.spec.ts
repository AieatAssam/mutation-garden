import { expect, test } from '@playwright/test';

test('loads a full-screen canvas with no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  const canvas = page.locator('canvas#stage');
  await expect(canvas).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-boot', /webgl/);
  const box = await canvas.boundingBox();
  const vp = page.viewportSize();
  expect(box?.width).toBe(vp?.width);
  expect(box?.height).toBe(vp?.height);
  expect(errors).toEqual([]);
});
