import { expect, test, type Page } from '@playwright/test';
import { PLOT_ACTIVATION_GUARD_MS } from '../../src/app/commands';

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
