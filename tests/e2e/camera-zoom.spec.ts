import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { expectHarvestPaid } from './payout';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import {
  createGardenCamera,
  panGardenCamera,
  resizeGardenCamera,
  zoomGardenCamera,
} from '../../src/render/camera';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type TouchPoint = Point & { id: number };

function project(world: Vector3, camera: ReturnType<typeof createGardenCamera>, rect: Rect): Point {
  const ndc = world.clone().project(camera);
  return {
    x: rect.x + (ndc.x + 1) * rect.width / 2,
    y: rect.y + (1 - ndc.y) * rect.height / 2,
  };
}

function plotCenter(plotId: number, camera: ReturnType<typeof createGardenCamera>, rect: Rect): Point {
  const xs = [-1.05, 1.05];
  const zs = [2, 0, -2];
  return project(new Vector3(xs[plotId % 2]!, 0.65, zs[Math.floor(plotId / 2)]!), camera, rect);
}

function sunnyFruitCenter(plotId: number, camera: ReturnType<typeof createGardenCamera>, rect: Rect): Point {
  const xs = [-1.05, 1.05];
  const zs = [2, 0, -2];
  return project(new Vector3(xs[plotId % 2]!, 1.81, zs[Math.floor(plotId / 2)]!), camera, rect);
}

function pinchPoints(camera: ReturnType<typeof createGardenCamera>, rect: Rect): [Point, Point] {
  // These points sit on the empty grass beyond the outer plot rows.
  return [
    project(new Vector3(0, 0.48, 3.1), camera, rect),
    project(new Vector3(0, 0.48, -3.1), camera, rect),
  ];
}

async function dispatchTouches(session: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: TouchPoint[]): Promise<void> {
  await session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

async function pinch(session: CDPSession, page: Page, start: [Point, Point], end: [Point, Point]): Promise<void> {
  await dispatchTouches(session, 'touchStart', [{ id: 1, ...start[0] }]);
  await dispatchTouches(session, 'touchStart', [
    { id: 1, ...start[0] },
    { id: 2, ...start[1] },
  ]);
  await dispatchTouches(session, 'touchMove', [
    { id: 1, ...end[0] },
    { id: 2, ...end[1] },
  ]);
  await dispatchTouches(session, 'touchEnd', []);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}

async function cancelPointer(page: Page, pointerId: number, point: Point): Promise<void> {
  await page.evaluate(({ id, x, y }) => {
    const stage = document.querySelector<HTMLCanvasElement>('#stage');
    if (!stage) throw new Error('Production garden canvas is missing');
    stage.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
    }));
  }, { id: pointerId, x: point.x, y: point.y });
}

async function renderedSignature(page: Page): Promise<string> {
  const rect = await readStageRect(page);
  const width = Math.min(160, Math.floor(rect.width));
  const height = Math.min(160, Math.floor(rect.height));
  const clip = {
    x: Math.floor(rect.x + (rect.width - width) / 2),
    y: Math.floor(rect.y + (rect.height - height) / 2),
    width,
    height,
  };
  const capture = async () => createHash('sha256').update(await page.screenshot({
    clip,
    animations: 'disabled',
    scale: 'css',
    type: 'jpeg',
    quality: 30,
  })).digest('hex');
  // A frame captured while synthetic touches are still being processed can differ by a few edge
  // pixels; compare the settled frame (two identical captures in a row).
  let previous = await capture();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const next = await capture();
    if (next === previous) return next;
    previous = next;
  }
  throw new Error('The garden frame did not settle');
}

async function readStageRect(page: Page): Promise<Rect> {
  const box = await page.locator('#stage').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x, y: box!.y, width: box!.width, height: box!.height };
}

async function waitForStageSize(page: Page, width: number, height: number): Promise<Rect> {
  await expect.poll(async () => {
    const box = await page.locator('#stage').boundingBox();
    return box ? [box.width, box.height] : null;
  }).toEqual([width, height]);
  return readStageRect(page);
}

async function pageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function groundPan(session: CDPSession | null, page: Page, point: Point, delta: Point, mobile: boolean): Promise<void> {
  const end = { x: point.x + delta.x, y: point.y + delta.y };
  if (mobile) {
    if (!session) throw new Error('Mobile touch session is missing');
    await dispatchTouches(session, 'touchStart', [{ id: 3, ...point }]);
    await dispatchTouches(session, 'touchMove', [{ id: 3, ...end }]);
    await dispatchTouches(session, 'touchEnd', []);
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 3 });
    await page.mouse.up();
  }
}

test('production zoom is deliberate, bounded, and leaves the garden playable', async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  const mobile = testInfo.project.name === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const stage = page.locator('#stage');
  await expect(stage).toBeVisible();
  const rect = await readStageRect(page);
  const touchSession = mobile ? await page.context().newCDPSession(page) : null;
  expect(rect).toMatchObject(viewport);

  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect.width, rect.height);
  const coins = page.getByRole('status', { name: 'Coins' });
  const sunny = page.getByRole('navigation', { name: 'Seeds' }).getByRole('button', { name: 'Sunny Sprout' });
  await expect(coins).toHaveText('12');
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  const baseSignature = await renderedSignature(page);
  const startingScrollY = await pageScrollY(page);

  if (mobile) {
    // A pair that begins on plots is rejected and cannot activate either plot.
    const plotPair: [Point, Point] = [plotCenter(0, camera, rect), plotCenter(1, camera, rect)];
    await pinch(touchSession!, page, plotPair, [
      { x: plotPair[0].x - 40, y: plotPair[0].y },
      { x: plotPair[1].x + 40, y: plotPair[1].y },
    ]);
    await expect(coins).toHaveText('12');

    // A UI-owned first contact blocks a second contact on the garden canvas.
    const seedBox = await sunny.boundingBox();
    expect(seedBox).not.toBeNull();
    const ground = pinchPoints(camera, rect);
    await dispatchTouches(touchSession!, 'touchStart', [
      { id: 4, x: seedBox!.x + seedBox!.width / 2, y: seedBox!.y + seedBox!.height / 2 },
    ]);
    await dispatchTouches(touchSession!, 'touchStart', [
      { id: 4, x: seedBox!.x + seedBox!.width / 2, y: seedBox!.y + seedBox!.height / 2 },
      { id: 5, ...ground[0] },
    ]);
    await dispatchTouches(touchSession!, 'touchMove', [
      { id: 4, x: seedBox!.x + seedBox!.width / 2, y: seedBox!.y + seedBox!.height / 2 },
      { id: 5, ...ground[1] },
    ]);
    await dispatchTouches(touchSession!, 'touchEnd', []);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(coins).toHaveText('12');
    expect(await renderedSignature(page)).toBe(baseSignature);
    await expect(sunny).toHaveAttribute('aria-pressed', 'true');

    // A real two-contact pinch reaches the upper bound, reverses to the default,
    // then returns to the upper bound. The held pair can never become a tap.
    const outwardStart = pinchPoints(camera, rect);
    const outwardEnd: [Point, Point] = [
      { x: outwardStart[0].x - 110, y: outwardStart[0].y },
      { x: outwardStart[1].x + 110, y: outwardStart[1].y },
    ];
    await pinch(touchSession!, page, outwardStart, outwardEnd);
    zoomGardenCamera(camera, Math.hypot(outwardEnd[1].x - outwardEnd[0].x, outwardEnd[1].y - outwardEnd[0].y) /
      (Math.hypot(outwardStart[1].x - outwardStart[0].x, outwardStart[1].y - outwardStart[0].y) + 10));
    const maximumSignature = await renderedSignature(page);
    expect(maximumSignature).not.toBe(baseSignature);

    const inwardStart = pinchPoints(camera, rect);
    const midpoint = { x: (inwardStart[0].x + inwardStart[1].x) / 2, y: (inwardStart[0].y + inwardStart[1].y) / 2 };
    const inwardEnd: [Point, Point] = [
      { x: midpoint.x - 5, y: midpoint.y },
      { x: midpoint.x + 5, y: midpoint.y },
    ];
    await pinch(touchSession!, page, inwardStart, inwardEnd);
    zoomGardenCamera(camera, 10 / (Math.hypot(inwardStart[1].x - inwardStart[0].x, inwardStart[1].y - inwardStart[0].y) + 10));
    expect(await renderedSignature(page)).toBe(baseSignature);

    const finalStart = pinchPoints(camera, rect);
    const finalEnd: [Point, Point] = [
      { x: finalStart[0].x - 110, y: finalStart[0].y },
      { x: finalStart[1].x + 110, y: finalStart[1].y },
    ];
    await pinch(touchSession!, page, finalStart, finalEnd);
    zoomGardenCamera(camera, Math.hypot(finalEnd[1].x - finalEnd[0].x, finalEnd[1].y - finalEnd[0].y) /
      (Math.hypot(finalStart[1].x - finalStart[0].x, finalStart[1].y - finalStart[0].y) + 10));

    // Cancel one captured contact. Moving the survivor must leave the camera and
    // gardening state unchanged until it also lifts.
    const cancelledStart = pinchPoints(camera, rect);
    await page.evaluate(() => {
      document.body.dataset.zoomPointerIds = '[]';
      document.querySelector<HTMLCanvasElement>('#stage')!.addEventListener('pointerdown', event => {
        const recorded = JSON.parse(document.body.dataset.zoomPointerIds ?? '[]') as Array<{ pointerId: number; pointerType: string }>;
        recorded.push({ pointerId: event.pointerId, pointerType: event.pointerType });
        document.body.dataset.zoomPointerIds = JSON.stringify(recorded);
      }, true);
    });
    await dispatchTouches(touchSession!, 'touchStart', [{ id: 6, ...cancelledStart[0] }]);
    await dispatchTouches(touchSession!, 'touchStart', [
      { id: 6, ...cancelledStart[0] }, { id: 7, ...cancelledStart[1] },
    ]);
    await dispatchTouches(touchSession!, 'touchMove', [
      { id: 6, x: cancelledStart[0].x - 30, y: cancelledStart[0].y },
      { id: 7, x: cancelledStart[1].x + 30, y: cancelledStart[1].y },
    ]);
    zoomGardenCamera(camera, Math.hypot(cancelledStart[1].x - cancelledStart[0].x + 60,
      cancelledStart[1].y - cancelledStart[0].y) /
      (Math.hypot(cancelledStart[1].x - cancelledStart[0].x, cancelledStart[1].y - cancelledStart[0].y) + 10));
    const pointerIds = await page.evaluate(() =>
      JSON.parse(document.body.dataset.zoomPointerIds ?? '[]') as Array<{ pointerId: number; pointerType: string }>);
    expect(pointerIds).toHaveLength(2);
    expect(pointerIds.map(({ pointerType }) => pointerType)).toEqual(['touch', 'touch']);
    await cancelPointer(page, pointerIds[0]!.pointerId, cancelledStart[0]);
    await dispatchTouches(touchSession!, 'touchMove', [
      { id: 6, ...cancelledStart[0] },
      { id: 7, x: cancelledStart[1].x + 90, y: cancelledStart[1].y + 12 },
    ]);
    await dispatchTouches(touchSession!, 'touchEnd', []);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(coins).toHaveText('12');
    await expect(sunny).toHaveAttribute('aria-pressed', 'true');
    expect(await renderedSignature(page)).toBe(maximumSignature);

    // A new pair works after the canceled survivor lifts. Zoom out, then restore
    // the maximum so the accepted evidence keeps the same camera framing.
    const freshStart = pinchPoints(camera, rect);
    const freshMidpoint = {
      x: (freshStart[0].x + freshStart[1].x) / 2,
      y: (freshStart[0].y + freshStart[1].y) / 2,
    };
    const freshInwardEnd: [Point, Point] = [
      { x: freshMidpoint.x - 5, y: freshMidpoint.y },
      { x: freshMidpoint.x + 5, y: freshMidpoint.y },
    ];
    await pinch(touchSession!, page, freshStart, freshInwardEnd);
    zoomGardenCamera(camera, 10 / (Math.hypot(freshStart[1].x - freshStart[0].x,
      freshStart[1].y - freshStart[0].y) + 10));
    expect(await renderedSignature(page)).not.toBe(maximumSignature);

    const rezoomStart = pinchPoints(camera, rect);
    const rezoomEnd: [Point, Point] = [
      { x: rezoomStart[0].x - 110, y: rezoomStart[0].y },
      { x: rezoomStart[1].x + 110, y: rezoomStart[1].y },
    ];
    await pinch(touchSession!, page, rezoomStart, rezoomEnd);
    zoomGardenCamera(camera, Math.hypot(rezoomEnd[1].x - rezoomEnd[0].x,
      rezoomEnd[1].y - rezoomEnd[0].y) /
      (Math.hypot(rezoomStart[1].x - rezoomStart[0].x, rezoomStart[1].y - rezoomStart[0].y) + 10));
    await expect(coins).toHaveText('12');
    await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  } else {
    // Browser wheel events at the canvas are accepted and cancel page scrolling.
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, -10_000);
    zoomGardenCamera(camera, Math.exp(1));
    const maximumSignature = await renderedSignature(page);
    expect(maximumSignature).not.toBe(baseSignature);
    await page.mouse.wheel(0, 10_000);
    zoomGardenCamera(camera, Math.exp(-1));
    expect(await renderedSignature(page)).toBe(baseSignature);
    await page.mouse.wheel(0, -500);
    zoomGardenCamera(camera, Math.exp(0.5));
    expect(await renderedSignature(page)).toBe(maximumSignature);
  }

  await expect(coins).toHaveText('12');
  expect(await pageScrollY(page)).toBe(startingScrollY);

  const panStart = project(new Vector3(0, 0.48, -3.1), camera, rect);
  const panDelta = { x: 58, y: -6 };
  const distance = Math.hypot(panDelta.x, panDelta.y);
  const effectivePan = {
    x: panDelta.x * (distance - 10) / distance,
    y: panDelta.y * (distance - 10) / distance,
  };
  await groundPan(touchSession, page, panStart, panDelta, mobile);
  panGardenCamera(camera, effectivePan.x, effectivePan.y, rect.width, rect.height);

  // Close the low-level CDP gesture session before using Playwright's regular
  // trusted touch input for planting and harvesting. All camera gesture
  // assertions have completed, and leaving both input channels attached can
  // make the final real touch intermittently stall on mobile Chromium.
  await touchSession?.detach();

  // Exercise camera reconciliation across a real viewport resize, then restore
  // the required project size before planting and harvesting.
  const resizedViewport = mobile ? { width: 400, height: 844 } : { width: 1270, height: 800 };
  await page.setViewportSize(resizedViewport);
  const resizedRect = await waitForStageSize(page, resizedViewport.width, resizedViewport.height);
  resizeGardenCamera(camera, resizedRect.width, resizedRect.height);
  await page.setViewportSize(viewport);
  const finalRect = await waitForStageSize(page, viewport.width, viewport.height);
  resizeGardenCamera(camera, finalRect.width, finalRect.height);

  const target = plotCenter(0, camera, finalRect);
  await expect(page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, target)).resolves.toBe('CANVAS');
  if (mobile) await sunny.tap();
  else await sunny.click();
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  if (mobile) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expect(coins).toHaveText('11');

  const plantedAt = await page.evaluate(() => Date.now());
  await expect.poll(() => page.evaluate(() => Date.now()), {
    intervals: [100, 250, 500],
    timeout: 15_000,
  }).toBeGreaterThanOrEqual(plantedAt + 8_200);
  const fruit = sunnyFruitCenter(0, camera, finalRect);
  await page.screenshot({
    path: mobile
      ? 'test-results/evidence/m1-17b4b-zoom-phone-390x844.png'
      : 'test-results/evidence/m1-17b4b-zoom-desktop-1280x800.png',
    // Capture the accepted viewport at CSS resolution; fullPage capture is
    // unusually slow with the mobile WebGL canvas in headless Chromium.
    scale: 'css',
  });
  await expectHarvestPaid(page, async () => {
    if (mobile) await page.touchscreen.tap(fruit.x, fruit.y);
    else await page.mouse.click(fruit.x, fruit.y);
  });
  expect(await pageScrollY(page)).toBe(startingScrollY);
  expect(errors).toEqual([]);
});
