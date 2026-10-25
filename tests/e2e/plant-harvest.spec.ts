import { expectHarvestPaid } from './payout';
import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { PLOT_ACTIVATION_GUARD_MS } from '../../src/app/commands';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { startWithSave } from './garden-save';

// These specs use seeds that unlock at levels 2 and 3, so they start from a level-3 save.
test.beforeEach(async ({ page }) => startWithSave(page));

async function firstPlotCenter(page: Page, projectName: string): Promise<{ x: number; y: number }> {
  await page.setViewportSize(projectName === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-render.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');
  const { point, picked } = await page.evaluate(() => {
    const probe = (window as Window & {
      gardenProbe: {
        inspect(): { plots: Array<{ plotId: string; x: number; y: number }> };
        pick(x: number, y: number): { kind: 'plot'; plotId: string } | { kind: 'ground' } | null;
      };
    }).gardenProbe;
    const point = probe.inspect().plots[4];
    return { point, picked: point ? probe.pick(point.x, point.y) : null };
  });
  expect(point?.plotId).toBe('plot-4');
  expect(picked).toEqual({ kind: 'plot', plotId: 'plot-4' });
  return { x: point!.x, y: point!.y };
}

async function productionPlotCenter(page: Page, projectName: string): Promise<{ x: number; y: number }> {
  await page.setViewportSize(projectName === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const stage = page.locator('#stage');
  await expect(stage).toBeVisible();
  const rect = await stage.boundingBox();
  expect(rect).not.toBeNull();

  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  camera.updateMatrixWorld(true);
  const projected = new Vector3(-1.05, 0.58, 2).project(camera);
  const point = {
    x: rect!.x + (projected.x + 1) * rect!.width / 2,
    y: rect!.y + (1 - projected.y) * rect!.height / 2,
  };
  expect(point.x).toBeGreaterThanOrEqual(rect!.x);
  expect(point.x).toBeLessThan(rect!.x + rect!.width);
  expect(point.y).toBeGreaterThanOrEqual(rect!.y);
  expect(point.y).toBeLessThan(rect!.y + rect!.height);
  const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point);
  expect(hitTarget).toBe('CANVAS');
  return point;
}

async function activatePlot(page: Page, point: { x: number; y: number }, mobile: boolean): Promise<void> {
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function waitForSimTick(page: Page, afterMs: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => performance.now()), {
    intervals: [10, 25, 50],
    timeout: 5_000,
  }).toBeGreaterThan(afterMs + 150);
}

async function waitUntilTimestamp(page: Page, timestampMs: number, timeout = 12_000): Promise<void> {
  await expect.poll(() => page.evaluate(() => Date.now()), {
    intervals: [100, 250, 500],
    timeout,
  }).toBeGreaterThanOrEqual(timestampMs);
}

async function waitUntilTimestampIsRendered(page: Page, timestampMs: number): Promise<void> {
  await page.evaluate((timestamp) => new Promise<void>((resolve) => {
    const checkFrame = () => {
      if (Date.now() >= timestamp) resolve();
      else requestAnimationFrame(checkFrame);
    };
    requestAnimationFrame(checkFrame);
  }), timestampMs);
}

test('Sunny harvest blocks a cross-tick repeat before allowing replant', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-portrait';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  const plot = await firstPlotCenter(page, testInfo.project.name);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const startedAt = await page.evaluate(() => Date.now());

  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const sunny = seeds.getByRole('button', { name: 'Sunny Sprout' });
  const coins = page.getByRole('status', { name: 'Coins' });
  const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, plot);
  expect(hitTarget).toBe('CANVAS');
  await page.evaluate(() => {
    const stage = document.querySelector('#stage')!;
    stage.addEventListener('pointerup', (event) => {
      if (event.target !== stage) return;
      const pointerUpTimes = (document.body.dataset.plotPointerUpTimes ?? '')
        .split(',').filter(Boolean).map(Number);
      pointerUpTimes.push(Date.now());
      document.body.dataset.plotPointerUpTimes = pointerUpTimes.join(',');
    }, true);
  });

  await expect(sunny).toBeVisible();
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(coins).toHaveText('12');
  const seedTarget = await sunny.boundingBox();
  expect(seedTarget).not.toBeNull();
  expect(seedTarget!.width).toBeGreaterThanOrEqual(48);
  expect(seedTarget!.height).toBeGreaterThanOrEqual(48);

  if (mobile) await sunny.tap();
  else await sunny.click();
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('11');
  const plantedAt = await page.evaluate(() => Date.now());

  // An immediate activation is too early to water or harvest; it must leave the seed and balance intact.
  const immatureTapAt = await page.evaluate(() => performance.now());
  await activatePlot(page, plot, mobile);
  await waitForSimTick(page, immatureTapAt);
  await expect(coins).toHaveText('11');

  // Wait for genuine timestamp-based growth; this keeps the whole first harvest under 30s.
  await waitUntilTimestamp(page, plantedAt + 8_500);
  await page.evaluate(() => { delete document.body.dataset.plotPointerUpTimes; });

  await activatePlot(page, plot, mobile);
  await expect(page.getByRole('status', { name: 'Crate' })).toHaveText('1/12');
  const repeatTickAt = await page.evaluate(() => performance.now());
  await activatePlot(page, plot, mobile);
  const repeatTap = await page.evaluate(() => {
    const times = (document.body.dataset.plotPointerUpTimes ?? '').split(',').map(Number);
    return { harvestAt: times[0]!, repeatAt: times[1]! };
  });

  // The real repeat tap starts from the first rendered empty-plot frame inside the guard window.
  expect(repeatTap.repeatAt - repeatTap.harvestAt).toBeGreaterThanOrEqual(0);
  expect(repeatTap.repeatAt - repeatTap.harvestAt).toBeLessThan(PLOT_ACTIVATION_GUARD_MS);
  await expect(coins).toHaveText('11');
  await waitForSimTick(page, repeatTickAt);
  await expect(coins).toHaveText('11');

  // At the guard boundary, a deliberate tap on the empty plot plants again and spends one coin.
  await waitUntilTimestampIsRendered(page, repeatTap.harvestAt + PLOT_ACTIVATION_GUARD_MS);
  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('10');
  const elapsedMs = await page.evaluate(() => Date.now()) - startedAt;
  expect(elapsedMs).toBeLessThan(30_000);
  expect(errors).toEqual([]);
});

test('Bubble Berry costs four coins, matures in fifteen seconds and pays its yield', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name === 'mobile-portrait';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const plot = await productionPlotCenter(page, testInfo.project.name);
  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const sunny = seeds.getByRole('button', { name: 'Sunny Sprout' });
  const bubble = seeds.getByRole('button', { name: 'Bubble Berry' });
  const coins = page.getByRole('status', { name: 'Coins' });
  await expect(coins).toHaveText('12');
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');

  const startedAt = await page.evaluate(() => Date.now());
  if (mobile) await bubble.tap();
  else await bubble.click();
  await expect(bubble).toHaveAttribute('aria-pressed', 'true');
  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('8');
  const plantedAt = await page.evaluate(() => Date.now());
  await waitUntilTimestampIsRendered(page, plantedAt + 15_000);

  const harvest = await expectHarvestPaid(page, () => activatePlot(page, plot, mobile));
  // Base 6, fresh +25%, yield size 0.8x to 1.5x.
  expect(harvest.paid).toBeGreaterThanOrEqual(4);
  expect(harvest.paid).toBeLessThanOrEqual(11);
  const firstHarvestElapsedMs = Date.now() - startedAt;
  console.info(`Bubble Berry first harvest (${testInfo.project.name}): ${firstHarvestElapsedMs}ms`);
  expect(firstHarvestElapsedMs).toBeLessThan(30_000);
  expect(errors).toEqual([]);
});

test('Twistroot costs five coins, matures after 25 seconds, pays its yield and can be replanted', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name === 'mobile-portrait';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const plot = await firstPlotCenter(page, testInfo.project.name);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const twistroot = seeds.getByRole('button', { name: 'Twistroot' });
  const coins = page.getByRole('status', { name: 'Coins' });
  await expect(coins).toHaveText('12');
  await expect(seeds.getByRole('button', { name: 'Sunny Sprout' })).toHaveAttribute('aria-pressed', 'true');

  if (mobile) await twistroot.tap();
  else await twistroot.click();
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');

  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('7');
  const plantedAt = await page.evaluate(() => Date.now());

  // An early real activation is too early to water; the Twistroot stays planted and keeps the exact balance.
  const immatureTapAt = await page.evaluate(() => performance.now());
  await activatePlot(page, plot, mobile);
  await waitForSimTick(page, immatureTapAt);
  await expect(coins).toHaveText('7');

  // The timestamped production plant reaches its 25-second harvest threshold before the next tap.
  await waitUntilTimestamp(page, plantedAt + 25_250, 30_000);
  // Base 10, yield size 0.8x to 1.5x, fresh up to +25%.
  const harvest = await expectHarvestPaid(page, () => activatePlot(page, plot, mobile));
  expect(harvest.paid).toBeGreaterThanOrEqual(8);
  expect(harvest.paid).toBeLessThanOrEqual(18);
  const firstHarvestElapsedMs = await page.evaluate((planted) => Date.now() - planted, plantedAt);
  expect(firstHarvestElapsedMs).toBeGreaterThanOrEqual(25_000);
  expect(firstHarvestElapsedMs).toBeLessThan(30_000);

  const harvestedAt = await page.evaluate(() => Date.now());
  await waitUntilTimestampIsRendered(page, harvestedAt + PLOT_ACTIVATION_GUARD_MS);
  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText(String(harvest.after - 5));
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('a planted seed and the spent coin survive a reload', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-portrait';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const plot = await firstPlotCenter(page, testInfo.project.name);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const coins = page.getByRole('status', { name: 'Coins' });
  await expect(coins).toHaveText('12');

  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('11');
  // Hiding the page saves at once, as when a phone switches apps.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Reload only once the write has landed; reloading earlier would save the old garden on pagehide.
  await expect.poll(() => page.evaluate(() => new Promise<number | undefined>((resolve) => {
    const request = indexedDB.open('mutation-garden', 1);
    request.onsuccess = () => {
      const get = request.result.transaction('saves', 'readonly').objectStore('saves').get('slot-0');
      get.onsuccess = () => { resolve(get.result?.state?.coins); request.result.close(); };
    };
  })), { timeout: 5_000 }).toBe(11);

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(coins).toHaveText('11');
});
