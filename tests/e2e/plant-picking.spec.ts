import { expect, test } from '@playwright/test';

test('a real tap or click on ripe Sunny fruit activates its owning plot outside the plot target', async ({ page }, testInfo) => {
  const desktop = testInfo.project.name === 'desktop';
  const viewport = desktop ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/plant-pick.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');

  const point = await page.locator('body').evaluate((body) => ({
    x: Number(body.getAttribute('data-fruit-x')),
    y: Number(body.getAttribute('data-fruit-y')),
    plotX: Number(body.getAttribute('data-plot-x')),
    plotY: Number(body.getAttribute('data-plot-y')),
  }));
  expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  expect(Math.hypot(point.x - point.plotX, point.y - point.plotY)).toBeGreaterThan(24);
  await expect(page.locator('body')).toHaveAttribute('data-fruit-pick', '{"kind":"plot","plotId":"plot-0"}');
  const canvas = page.locator('#stage');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  expect(point.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(point.x).toBeLessThan(bounds!.x + bounds!.width);
  expect(point.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(point.y).toBeLessThan(bounds!.y + bounds!.height);

  if (desktop) await page.mouse.click(point.x, point.y);
  else await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('body')).toHaveAttribute('data-activated-plot', 'plot-0');
});
