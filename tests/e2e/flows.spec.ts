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
  { intervals: [50, 100], timeout: 25_000 }).toBeGreaterThanOrEqual(timestampMs);

test('a new player is guided from the first plant to the first harvest within 30 s', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const tapPlot = await openGarden(page, mobile);
  const startedAt = await page.evaluate(() => Date.now());
  const hint = page.locator('.garden-ui__hint');
  const coins = page.getByRole('status', { name: 'Coins' });

  await expect(hint).toHaveText('Tap a plot to plant.');
  await tapPlot(0);
  await expect(coins).toHaveText('11');
  await expect(hint).toHaveText('Tap a growing plant to water it.');
  await expect(hint).toHaveText('Tap the ripe plant to harvest.', { timeout: 12_000 });
  await expectHarvestPaid(page, () => tapPlot(0));
  expect(await page.evaluate(() => Date.now()) - startedAt).toBeLessThan(30_000);
});

test.describe('watering', () => {
  test.beforeEach(async ({ page }) => startWithSave(page));

  test('watering a sprout makes it ripe sooner', async ({ page }, info) => {
    const mobile = info.project.name === 'mobile-portrait';
    const tapPlot = await openGarden(page, mobile);
    const coins = page.getByRole('status', { name: 'Coins' });
    await page.getByRole('navigation', { name: 'Seeds' }).getByRole('button', { name: 'Twistroot' }).click();

    // Twistroot: Sprout from 3 s, ripe at 25 s. Times are taken before the plant tap, so the real
    // plant time is a little later and every deadline below errs on the safe side.
    const beforePlant = await page.evaluate(() => Date.now());
    await tapPlot(2);
    await expect(coins).toHaveText('7');
    await waitUntil(page, beforePlant + 3_600);
    await tapPlot(2);
    // Watering cuts 30% of the time left (about 6 s), so it ripens near 19 s instead of 25 s.
    await waitUntil(page, beforePlant + 20_000);
    await tapPlot(2);
    await expect.poll(() => coins.textContent(), { intervals: [50], timeout: 4_000 }).not.toBe('7');
    expect(await page.evaluate(() => Date.now()), 'paid before it could have ripened unwatered')
      .toBeLessThan(beforePlant + 25_000);
  });
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
