import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { PLOT_ACTIVATION_GUARD_MS } from '../../src/app/commands';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';

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
    const point = probe.inspect().plots[0];
    return { point, picked: point ? probe.pick(point.x, point.y) : null };
  });
  expect(point?.plotId).toBe('plot-0');
  expect(picked).toEqual({ kind: 'plot', plotId: 'plot-0' });
  return { x: point!.x, y: point!.y };
}

async function productionPlotCenter(page: Page, projectName: string): Promise<{ x: number; y: number }> {
  await page.setViewportSize(projectName === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
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

async function waitUntilTimestamp(page: Page, timestampMs: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => Date.now()), {
    intervals: [100, 250, 500],
    timeout: 12_000,
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

  // An immediate activation is an immature harvest attempt; it must leave the seed and balance intact.
  const immatureTapAt = await page.evaluate(() => performance.now());
  await activatePlot(page, plot, mobile);
  await waitForSimTick(page, immatureTapAt);
  await expect(coins).toHaveText('11');

  // Wait for genuine timestamp-based growth; this keeps the whole first harvest under 30s.
  await waitUntilTimestamp(page, plantedAt + 8_500);
  await page.evaluate(() => { delete document.body.dataset.plotPointerUpTimes; });

  await activatePlot(page, plot, mobile);
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Coins"]')?.textContent?.trim() === '13',
  undefined, { polling: 'raf' });
  const repeatTickAt = await page.evaluate(() => performance.now());
  await activatePlot(page, plot, mobile);
  const repeatTap = await page.evaluate(() => {
    const times = (document.body.dataset.plotPointerUpTimes ?? '').split(',').map(Number);
    return { harvestAt: times[0]!, repeatAt: times[1]! };
  });

  // The real repeat tap starts from the first rendered empty-plot frame inside the guard window.
  expect(repeatTap.repeatAt - repeatTap.harvestAt).toBeGreaterThanOrEqual(0);
  expect(repeatTap.repeatAt - repeatTap.harvestAt).toBeLessThan(PLOT_ACTIVATION_GUARD_MS);
  await expect(coins).toHaveText('13');
  await waitForSimTick(page, repeatTickAt);
  await expect(coins).toHaveText('13');

  // At the guard boundary, a deliberate tap on the empty plot plants again and spends one coin.
  await waitUntilTimestampIsRendered(page, repeatTap.harvestAt + PLOT_ACTIVATION_GUARD_MS);
  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('12');
  const elapsedMs = await page.evaluate(() => Date.now()) - startedAt;
  expect(elapsedMs).toBeLessThan(30_000);
  expect(errors).toEqual([]);
});

test('Bubble Berry costs three coins, matures in fifteen seconds, pays six once and removes its rig', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name === 'mobile-portrait';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const plot = await productionPlotCenter(page, testInfo.project.name);
  await page.evaluate(() => {
    const stage = document.querySelector('#stage')!;
    stage.addEventListener('pointerup', (event) => {
      if (event.target !== stage) return;
      const times = (document.body.dataset.bubblePointerUpTimes ?? '').split(',').filter(Boolean);
      times.push(String(Date.now()));
      document.body.dataset.bubblePointerUpTimes = times.join(',');
    }, true);
  });
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
  await expect(coins).toHaveText('9');
  const plantedAt = Date.now();

  await expect.poll(() => Date.now(), {
    intervals: [100, 250, 500],
    timeout: 45_000,
  }).toBeGreaterThanOrEqual(plantedAt + 15_000);

  await activatePlot(page, plot, mobile);
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Coins"]')?.textContent?.trim() === '15',
  undefined, { polling: 'raf' });
  await activatePlot(page, plot, mobile);
  const repeatedTap = await page.evaluate(() => {
    const times = (document.body.dataset.bubblePointerUpTimes ?? '').split(',').map(Number);
    return {
      harvestAt: times.at(-2)!,
      repeatAt: times.at(-1)!,
    };
  });
  const firstHarvestElapsedMs = repeatedTap.harvestAt - startedAt;
  console.info(`Bubble Berry first harvest (${testInfo.project.name}): ${firstHarvestElapsedMs}ms`);
  expect(firstHarvestElapsedMs).toBeLessThan(30_000);
  expect(repeatedTap.repeatAt - repeatedTap.harvestAt).toBeGreaterThanOrEqual(0);
  expect(repeatedTap.repeatAt - repeatedTap.harvestAt).toBeLessThan(PLOT_ACTIVATION_GUARD_MS);
  const repeatTickAt = await page.evaluate(() => performance.now());
  await waitForSimTick(page, repeatTickAt);
  await expect(coins).toHaveText('15');

  await waitUntilTimestampIsRendered(page, repeatedTap.harvestAt + PLOT_ACTIVATION_GUARD_MS);
  await activatePlot(page, plot, mobile);
  await expect(coins).toHaveText('12');
  expect(errors).toEqual([]);
});
