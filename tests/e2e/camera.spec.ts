import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, panGardenCamera, resizeGardenCamera } from '../../src/render/camera';

type Point = { x: number; y: number };

function projectWorldPoint(world: Vector3, camera: ReturnType<typeof createGardenCamera>, rect: { x: number; y: number; width: number; height: number }): Point {
  const ndc = world.clone().project(camera);
  return {
    x: rect.x + (ndc.x + 1) * rect.width / 2,
    y: rect.y + (1 - ndc.y) * rect.height / 2,
  };
}

function plotCenter(plotId: number, camera: ReturnType<typeof createGardenCamera>, rect: { x: number; y: number; width: number; height: number }): Point {
  const xs = [-1.05, 1.05];
  const zs = [2, 0, -2];
  return projectWorldPoint(new Vector3(xs[plotId % 2]!, 0.65, zs[Math.floor(plotId / 2)]!), camera, rect);
}

function ripeSunnyFruitCenter(plotId: number, camera: ReturnType<typeof createGardenCamera>, rect: { x: number; y: number; width: number; height: number }): Point {
  const xs = [-1.05, 1.05];
  const zs = [2, 0, -2];
  // At harvestable growth the fruit rig center is plot height + stem + fruit radius.
  return projectWorldPoint(new Vector3(xs[plotId % 2]!, 0.65 + 0.85 + 0.31, zs[Math.floor(plotId / 2)]!), camera, rect);
}

async function swipe(page: Page, start: Point, delta: Point, mobile: boolean): Promise<void> {
  const end = { x: start.x + delta.x, y: start.y + delta.y };
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: start.x, y: start.y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: end.x, y: end.y }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 3 });
    await page.mouse.up();
  }
}

async function tap(page: Page, point: Point, mobile: boolean): Promise<void> {
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

test('ground swipes pan while plot and planted-plant swipes keep their down ownership', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const mobile = testInfo.project.name === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  const canvas = page.locator('#stage');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();

  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  camera.updateMatrixWorld(true);
  const project = (world: Vector3) => projectWorldPoint(world, camera, rect!);
  const ground = project(new Vector3(0, 0.48, 0));
  const panDelta = { x: 64, y: -8 };
  const panDistance = Math.hypot(panDelta.x, panDelta.y);
  const appliedPanDelta = {
    x: panDelta.x * (panDistance - 10) / panDistance,
    y: panDelta.y * (panDistance - 10) / panDistance,
  };
  const expectedCamera = createGardenCamera();
  resizeGardenCamera(expectedCamera, rect!.width, rect!.height);
  panGardenCamera(expectedCamera, appliedPanDelta.x, appliedPanDelta.y, rect!.width, rect!.height);
  expectedCamera.updateMatrixWorld(true);
  const expectedPlots = [0, 1, 2].map(id => plotCenter(id, expectedCamera, rect!));
  const coins = page.getByRole('status', { name: 'Coins' });
  await expect(coins).toHaveText('12');

  await swipe(page, ground, panDelta, mobile);
  const translatedPlot0 = expectedPlots[0]!;
  await tap(page, translatedPlot0, mobile);
  await expect(coins).toHaveText('11');
  await page.waitForTimeout(8_200);

  const translatedFruit0 = ripeSunnyFruitCenter(0, expectedCamera, rect!);
  await swipe(page, translatedFruit0, { x: 70, y: 12 }, mobile);
  await expect(coins).toHaveText('13');
  await swipe(page, translatedPlot0, { x: 70, y: 12 }, mobile);
  await expect(coins).toHaveText('13');

  const translatedPlot1 = expectedPlots[1]!;
  await tap(page, translatedPlot1, mobile);
  await expect(coins).toHaveText('12');
  await swipe(page, translatedPlot1, { x: 70, y: 12 }, mobile);
  await expect(coins).toHaveText('12');
  const translatedPlot2 = expectedPlots[2]!;
  await tap(page, translatedPlot2, mobile);
  await expect(coins).toHaveText('11');
  expect(errors).toEqual([]);

  await page.screenshot({
    path: mobile
      ? 'docs/art/evidence/m1-17a-pan-phone-390x844.png'
      : 'docs/art/evidence/m1-17a-pan-desktop-1280x800.png',
    fullPage: true,
  });
});
