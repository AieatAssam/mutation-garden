import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { MUTATIONS } from '../../src/sim/content/mutations';
import { startWithSave } from './garden-save';

async function openGarden(page: Page, mobile: boolean): Promise<void> {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
}

async function activate(page: Page, locator: ReturnType<Page['getByRole']>, mobile: boolean): Promise<void> {
  if (mobile) await locator.tap(); else await locator.click();
}

async function tapPlot(page: Page, plot: number, mobile: boolean): Promise<void> {
  const rect = await page.locator('#stage').boundingBox();
  expect(rect).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  camera.updateMatrixWorld(true);
  const [x, y, z] = [
    [-1.05, 0.65, 2], [1.05, 0.65, 2],
    [-1.05, 0.65, 0], [1.05, 0.65, 0],
    [-1.05, 0.65, -2], [1.05, 0.65, -2],
  ][plot]!;
  const point = new Vector3(x, y, z).project(camera);
  const px = rect!.x + (point.x + 1) * rect!.width / 2;
  const py = rect!.y + (1 - point.y) * rect!.height / 2;
  if (mobile) await page.touchscreen.tap(px, py); else await page.mouse.click(px, py);
}

async function readSavedState(page: Page): Promise<{ order?: { index: number; progress: number }; rewardsPaid?: string[] } | null> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('mutation-garden', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('saves', 'readonly').objectStore('saves').get('slot-0');
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => { database.close(); resolve(read.result?.state ?? null); };
    };
  }));
}

test('Journal shows discoveries, recipes and live odds; closes by button or Escape', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  await startWithSave(page, 900, {
    discoveries: ['sunny-sprout:giant'],
    rewardsPaid: ['sunny-sprout:giant'],
    order: { index: 0, progress: 0 },
  });
  await openGarden(page, mobile);

  const journal = page.getByRole('button', { name: /^Journal \d+\/\d+$/ });
  const journalBounds = await journal.boundingBox();
  expect(journalBounds).not.toBeNull();
  expect(journalBounds!.width).toBeGreaterThanOrEqual(48);
  expect(journalBounds!.height).toBeGreaterThanOrEqual(48);
  await activate(page, journal, mobile);

  const dialog = page.getByRole('dialog', { name: 'Discoveries' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('touch-action', 'pan-y');
  await expect(dialog.getByText('First on this device')).toBeVisible();
  await expect(dialog.getByText('Not found')).toHaveCount(8);
  const giantRecipe = dialog.getByRole('heading', { name: 'Giant ×2' }).locator('xpath=..');
  await expect(giantRecipe).toContainText(`${Number((MUTATIONS.giant.naturalChance * 100).toFixed(1))}% natural chance`);
  const goldenRecipe = dialog.getByRole('heading', { name: 'Golden ×4' }).locator('xpath=..');
  await expect(goldenRecipe).toContainText(`${Number((MUTATIONS.golden.naturalChance * 100).toFixed(1))}% natural chance`);
  await expect(goldenRecipe).toContainText(/Sunny Sprout/i);
  await expect(dialog.getByText('Sell 3 Sunny Sprouts', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/mutation-engagement-${mobile ? 'phone' : 'desktop'}-journal.png`, scale: 'css' });

  const close = dialog.getByRole('button', { name: 'Close' });
  const closeBounds = await close.boundingBox();
  expect(closeBounds).not.toBeNull();
  expect(closeBounds!.width).toBeGreaterThanOrEqual(48);
  expect(closeBounds!.height).toBeGreaterThanOrEqual(48);
  await dialog.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(close).toBeInViewport();
  await page.screenshot({ path: `/tmp/mutation-engagement-${mobile ? 'phone' : 'desktop'}-recipes.png`, scale: 'css' });
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(journal).toBeFocused();
  await page.screenshot({ path: `/tmp/mutation-engagement-${mobile ? 'phone' : 'desktop'}-hud.png`, scale: 'css' });

  await journal.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(journal).toBeFocused();
});

test('selling the first order pays once and keeps the next order through reload', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  await startWithSave(page, 487, { crateCount: 3, order: { index: 0, progress: 0 } });
  await openGarden(page, mobile);
  const journal = page.getByRole('button', { name: /^Journal \d+\/\d+$/ });
  await activate(page, journal, mobile);
  const dialog = page.getByRole('dialog', { name: 'Discoveries' });
  await expect(dialog.getByText('Sell 3 Sunny Sprouts', { exact: true })).toBeVisible();
  await expect(dialog.getByText('0 of 3 · 6 coins · 10 XP')).toBeVisible();
  await page.keyboard.press('Escape');

  await activate(page, page.getByRole('button', { name: 'Sell', exact: true }), mobile);
  await expect(page.getByRole('status', { name: 'Crate' })).toHaveText('0/12');
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('21');
  await expect(page.locator('.garden-ui__level-text')).toHaveText('Level 2');
  await activate(page, journal, mobile);
  await expect(dialog.getByText('Water 4 times', { exact: true })).toBeVisible();
  await expect(dialog.getByText('0 of 4 · 4 coins · 10 XP')).toBeVisible();

  await expect.poll(async () => (await readSavedState(page))?.order).toEqual({ index: 1, progress: 0 });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('21');
  await activate(page, journal, mobile);
  await expect(page.getByRole('dialog', { name: 'Discoveries' }).getByText('Water 4 times', { exact: true })).toBeVisible();
});

test('watering four times completes the active order through player input', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  await startWithSave(page, 0, {
    discoveries: ['sunny-sprout:giant'],
    rewardsPaid: ['sunny-sprout:giant'],
    order: { index: 1, progress: 0 },
  });
  await openGarden(page, mobile);
  const hint = page.locator('.garden-ui__hint');

  await tapPlot(page, 0, mobile);
  await expect(hint).toHaveText('Tap a growing plant to water it.', { timeout: 5_000 });
  await tapPlot(page, 0, mobile);
  await expect(hint).toHaveText('Water it again to grow a Giant.');
  await tapPlot(page, 0, mobile);

  await tapPlot(page, 1, mobile);
  await expect(hint).toHaveText('Tap a growing plant to water it.', { timeout: 5_000 });
  await tapPlot(page, 1, mobile);
  await expect(hint).toHaveText('Water it again to grow a Giant.');
  await tapPlot(page, 1, mobile);

  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('14');
  const journal = page.getByRole('button', { name: /^Journal \d+\/\d+$/ });
  await activate(page, journal, mobile);
  const dialog = page.getByRole('dialog', { name: 'Discoveries' });
  await expect(dialog.getByText('Harvest 3 together', { exact: true })).toBeVisible();
  await expect(dialog.getByText('0 of 3 · 6 coins · 10 XP')).toBeVisible();
});

test('finishing saved order progress once survives reload without another payout', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  await startWithSave(page, 489, { crateCount: 1, order: { index: 0, progress: 2 } });
  await openGarden(page, mobile);
  await activate(page, page.getByRole('button', { name: 'Sell', exact: true }), mobile);
  await expect(page.getByRole('status', { name: 'Crate' })).toHaveText('0/12');
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('19');
  await expect(page.locator('.garden-ui__level-text')).toHaveText('Level 2');

  const journal = page.getByRole('button', { name: /^Journal \d+\/\d+$/ });
  await activate(page, journal, mobile);
  const dialog = page.getByRole('dialog', { name: 'Discoveries' });
  await expect(dialog.getByText('Water 4 times', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readSavedState(page))?.order).toEqual({ index: 1, progress: 0 });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('19');
  await activate(page, journal, mobile);
  await expect(page.getByRole('dialog', { name: 'Discoveries' }).getByText('Water 4 times', { exact: true })).toBeVisible();
});

test('first mutation reward is not paid again after reload', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const now = Date.now();
  await startWithSave(page, 0, {
    scriptedGiantUsed: false,
    twistrootPlantedAt: now - 25_000,
    twistrootWaterCount: 2,
    savedAt: now,
  });
  await openGarden(page, mobile);
  await expect(page.getByText('New mutation: Giant!')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('72');
  await expect.poll(async () => (await readSavedState(page))?.rewardsPaid).toContain('twistroot:giant');

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('72');
  const journal = page.getByRole('button', { name: /^Journal \d+\/\d+$/ });
  await activate(page, journal, mobile);
  const dialog = page.getByRole('dialog', { name: 'Discoveries' });
  await expect(dialog.getByText('First on this device')).toBeVisible();
});
