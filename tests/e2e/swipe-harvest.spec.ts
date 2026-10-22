import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { PLOT_ACTIVATION_GUARD_MS } from '../../src/app/commands';
import { expectHarvestPaid } from './payout';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { startWithSave } from './garden-save';

// These specs use seeds that unlock at levels 2 and 3, so they start from a level-3 save.
test.beforeEach(async ({ page }) => startWithSave(page));

type Point = { x: number; y: number };

async function freezeGrowthClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    let nowMs = Date.now();
    Date.now = () => nowMs;
    Object.defineProperty(window, '__gardenSwipeClock', {
      configurable: false,
      value: { advance: (deltaMs: number) => { nowMs += deltaMs; } },
    });
  });
}

async function advanceGrowthClock(page: Page, deltaMs: number): Promise<void> {
  await page.evaluate((delta) => {
    (window as unknown as Window & { __gardenSwipeClock: { advance(deltaMs: number): void } })
      .__gardenSwipeClock.advance(delta);
  }, deltaMs);
}

function plotCenter(plotId: number, rect: { x: number; y: number; width: number; height: number }): Point {
  return projectWorld(new Vector3([-1.05, 1.05][plotId % 2]!, 0.65, [2, 0, -2][Math.floor(plotId / 2)]!), rect);
}

function projectWorld(world: Vector3, rect: { x: number; y: number; width: number; height: number }): Point {
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect.width, rect.height);
  camera.updateMatrixWorld(true);
  const projected = world.clone().project(camera);
  return {
    x: rect.x + (projected.x + 1) * rect.width / 2,
    y: rect.y + (1 - projected.y) * rect.height / 2,
  };
}

async function plotSignature(page: Page, point: Point): Promise<string> {
  const rect = await page.locator('#stage').boundingBox();
  expect(rect).not.toBeNull();
  const width = Math.min(40, Math.floor(rect!.width));
  const height = Math.min(40, Math.floor(rect!.height));
  const clip = {
    x: Math.floor(Math.max(rect!.x, Math.min(point.x - width / 2, rect!.x + rect!.width - width))),
    y: Math.floor(Math.max(rect!.y, Math.min(point.y - height / 2, rect!.y + rect!.height - height))),
    width,
    height,
  };
  const image = await page.screenshot({ clip, animations: 'disabled', scale: 'css' });
  return createHash('sha256').update(image).digest('hex');
}

async function swipe(page: Page, points: Point[], mobile: boolean): Promise<void> {
  const [start, ...path] = points;
  if (!start) throw new Error('A swipe needs a starting point');
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ id: 1, x: start.x, y: start.y }],
    });
    for (const point of path) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ id: 1, x: point.x, y: point.y }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const point of path) await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.mouse.up();
  }
}

async function cancelSwipe(page: Page, start: Point, end: Point, mobile: boolean): Promise<void> {
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ id: 1, x: start.x, y: start.y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ id: 1, x: end.x, y: end.y }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(-2, -2, { steps: 4 });
    await page.mouse.up();
  }
}

test('plot swipe harvests each ripe crossing once and cancellation preserves ownership', async ({ page }, info) => {
  test.setTimeout(120_000);
  const mobile = info.project.name === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const canvas = page.locator('#stage');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();

  const plots = [0, 1, 2, 4].map((id) => plotCenter(id, rect!));
  // The pond: scenery no plant, effect or HUD element covers, so it only changes if the camera pans.
  const untouchedRock = projectWorld(new Vector3(-2.85, 0.48, 1.0), rect!);
  const coins = page.getByRole('status', { name: 'Coins' });
  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const sunny = seeds.getByRole('button', { name: 'Sunny Sprout' });
  await expect(coins).toHaveText('12');
  for (const id of [0, 2, 4]) {
    if (mobile) await sunny.tap();
    else await sunny.click();
    await expect(sunny).toHaveAttribute('aria-pressed', 'true');
    if (mobile) await page.touchscreen.tap(plots[id === 0 ? 0 : id === 2 ? 2 : 3]!.x, plots[id === 0 ? 0 : id === 2 ? 2 : 3]!.y);
    else await page.mouse.click(plots[id === 0 ? 0 : id === 2 ? 2 : 3]!.x, plots[id === 0 ? 0 : id === 2 ? 2 : 3]!.y);
  }
  await expect(coins).toHaveText('9');
  const plantedAt = await page.evaluate(() => Date.now());
  await expect.poll(() => page.evaluate(() => Date.now()), {
    intervals: [100, 250, 500], timeout: 15_000,
  }).toBeGreaterThanOrEqual(plantedAt + 8_250);

  // A canceled plot-owned path across ripe crops must neither harvest nor pan.
  const beforeCancellation = await plotSignature(page, untouchedRock);
  await cancelSwipe(page, plots[0]!, plots[3]!, mobile);
  await expect(coins).toHaveText('9');
  expect(await plotSignature(page, untouchedRock)).toBe(beforeCancellation);
  const bubble = seeds.getByRole('button', { name: 'Bubble Berry' });
  if (mobile) await bubble.tap();
  else await bubble.click();
  await expect(bubble).toHaveAttribute('aria-pressed', 'true');
  if (mobile) await page.touchscreen.tap(plots[1]!.x, plots[1]!.y);
  else await page.mouse.click(plots[1]!.x, plots[1]!.y);
  await expect(coins).toHaveText('6');
  // Keep the newly planted Bubble Berry unripe while the desktop trace/screenshot runs.
  // Sunnys have already grown against the real clock; only the guard-boundary check below advances this clock.
  await freezeGrowthClock(page);
  const beforeHarvest = await plotSignature(page, untouchedRock);

  // A fresh swipe crosses three ripe plants, reverses over one, and commits one batch.
  const harvest = await expectHarvestPaid(page, () => swipe(page, [plots[0]!, plots[2]!, plots[3]!, plots[2]!], mobile));
  // Three fresh Sunny Sprouts in one swipe: at least 1 each, plus any combo bonus shown.
  expect(harvest.paid).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  expect(await plotSignature(page, untouchedRock)).toBe(beforeHarvest);
  const harvestAt = await page.evaluate(() => Date.now());

  // Repeating the same harvest cannot pay again or turn its release into planting.
  await swipe(page, [plots[0]!, plots[2]!, plots[3]!], mobile);
  await expect(coins).toHaveText(String(harvest.after));
  await advanceGrowthClock(page, PLOT_ACTIVATION_GUARD_MS);
  await expect.poll(() => page.evaluate(() => Date.now()), {
    intervals: [10, 25, 50], timeout: 5_000,
  }).toBeGreaterThanOrEqual(harvestAt + PLOT_ACTIVATION_GUARD_MS);

  await swipe(page, [plots[0]!, plots[2]!, plots[3]!], mobile);
  const simTickAt = await page.evaluate(() => performance.now());
  await expect.poll(() => page.evaluate(() => performance.now()), {
    intervals: [10, 25, 50], timeout: 5_000,
  }).toBeGreaterThan(simTickAt + 150);
  await expect(coins).toHaveText(String(harvest.after));

  if (mobile) await page.touchscreen.tap(plots[0]!.x, plots[0]!.y);
  else await page.mouse.click(plots[0]!.x, plots[0]!.y);
  await expect(coins).toHaveText(String(harvest.after - 3));
  expect(errors).toEqual([]);
});
