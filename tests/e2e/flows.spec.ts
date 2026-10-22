import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { expectHarvestPaid } from './payout';
import { startWithSave } from './garden-save';

// Player flows from the M1 critique (#178): the first minute, a successful water, and Harvest all.

const plotWorldCenters = [
  [-1.05, 0.65, 2], [1.05, 0.65, 2],
  [-1.05, 0.65, 0], [1.05, 0.65, 0],
  [-1.05, 0.65, -2], [1.05, 0.65, -2],
] as const;

async function openGarden(page: Page, mobile: boolean): Promise<(index: number) => Promise<void>> {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const rect = (await page.locator('#stage').boundingBox())!;
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect.width, rect.height);
  camera.updateMatrixWorld(true);
  return async (index) => {
    const [x, y, z] = plotWorldCenters[index]!;
    const point = new Vector3(x, y, z).project(camera);
    const px = rect.x + (point.x + 1) * rect.width / 2;
    const py = rect.y + (1 - point.y) * rect.height / 2;
    if (mobile) await page.touchscreen.tap(px, py);
    else await page.mouse.click(px, py);
  };
}

const waitUntil = (page: Page, timestampMs: number) => expect.poll(() => page.evaluate(() => Date.now()),
  { intervals: [50, 100], timeout: 15_000 }).toBeGreaterThanOrEqual(timestampMs);

test('a new player is guided from the first plant to the first harvest within 30 s', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const tapPlot = await openGarden(page, mobile);
  const startedAt = await page.evaluate(() => Date.now());
  const hint = page.locator('.garden-ui__hint');
  const coins = page.getByRole('status', { name: 'Coins' });

  await expect(hint).toHaveText('Tap a plot to plant.');
  await tapPlot(0);
  await expect(coins).toHaveText('11');
  await expect(hint).toHaveText('Plants grow on their own. Tap one to water it.');
  await expect(hint).toHaveText('Tap the ripe plant to harvest it.', { timeout: 12_000 });
  await expectHarvestPaid(page, () => tapPlot(0));
  expect(await page.evaluate(() => Date.now()) - startedAt).toBeLessThan(30_000);
});

test('watering a sprout makes it ripe sooner', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const tapPlot = await openGarden(page, mobile);
  const coins = page.getByRole('status', { name: 'Coins' });

  await tapPlot(2);
  await expect(coins).toHaveText('11');
  const plantedAt = await page.evaluate(() => Date.now());
  // After the replant guard (2.5 s) the plant is a Sprout; watering cuts 30% of the 5.3 s left, so it
  // ripens near 6.4 s instead of 8 s.
  await waitUntil(page, plantedAt + 2_700);
  await tapPlot(2);
  await waitUntil(page, plantedAt + 6_900);
  await tapPlot(2);
  await expect(coins).not.toHaveText('11', { timeout: Math.max(1, plantedAt + 7_800 - await page.evaluate(() => Date.now())) });
});

test.describe('with every seed unlocked', () => {
  test.beforeEach(async ({ page }) => startWithSave(page));

  test('Harvest all appears with two ripe plants and pays each once', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile-portrait';
    const tapPlot = await openGarden(page, mobile);
    const harvestAll = page.getByRole('button', { name: /^Harvest all/ }).last();
    await tapPlot(0);
    await tapPlot(1);
    await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('10');
    await expect(harvestAll).toBeVisible({ timeout: 12_000 });
    await expect(harvestAll).toHaveText('Harvest all 2');
    const box = (await harvestAll.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    const { paid } = await expectHarvestPaid(page, () => mobile ? harvestAll.tap() : harvestAll.click());
    expect(paid).toBeGreaterThanOrEqual(2 * 2);
    await expect(harvestAll).toBeHidden();
  });
});
