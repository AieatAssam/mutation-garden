import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';

const TEST_START_TIME = new Date('2026-10-19T15:00:00.000Z').getTime();

async function waitForRender(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function setGameTime(page: Page, timeMs: number): Promise<void> {
  await page.evaluate((time) => {
    const testWindow = window as Window & { setGardenTestTime?: (nextTime: number) => void };
    if (!testWindow.setGardenTestTime) throw new Error('Test clock was not initialized');
    testWindow.setGardenTestTime(time);
  }, timeMs);
  // Only Date.now is controlled; browser timers and RAF stay native for WebGL screenshots.
  await page.waitForTimeout(120);
  await waitForRender(page);
}

async function changedPixelCount(page: Page, beforePng: Buffer, afterPng: Buffer): Promise<number> {
  return page.evaluate(async ({ before, after }) => {
    const pixels = async (encoded: string) => {
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not read screenshot pixels');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [first, second] = await Promise.all([pixels(before), pixels(after)]);
    if (first.length !== second.length) throw new Error('Screenshot clips have different dimensions');
    let changed = 0;
    for (let index = 0; index < first.length; index += 4) {
      if (first[index] !== second[index]
        || first[index + 1] !== second[index + 1]
        || first[index + 2] !== second[index + 2]) changed += 1;
    }
    return changed;
  }, { before: beforePng.toString('base64'), after: afterPng.toString('base64') });
}

function plotGroundClip(point: { x: number; y: number }, viewport: { width: number; height: number }) {
  const x = Math.max(0, Math.min(viewport.width - 1, Math.round(point.x - 54)));
  const y = Math.max(0, Math.min(viewport.height - 1, Math.round(point.y + 4)));
  return { x, y, width: Math.min(108, viewport.width - x), height: Math.min(48, viewport.height - y) };
}

function plotPlantClip(point: { x: number; y: number }, viewport: { width: number; height: number }) {
  const x = Math.max(0, Math.min(viewport.width - 1, Math.round(point.x - 108)));
  const y = Math.max(0, Math.min(viewport.height - 1, Math.round(point.y - 180)));
  return { x, y, width: Math.min(216, viewport.width - x), height: Math.min(260, viewport.height - y) };
}

async function plantFirstPlot(page: Page, projectName: string, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<{ plantedAt: number; suffix: string; point: { x: number; y: number }; viewport: { width: number; height: number } }> {
  const mobile = projectName === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const suffix = mobile ? 'phone-390x844' : 'desktop-1280x800';
  await page.addInitScript((initialTime) => {
    let gameTime = initialTime;
    Date.now = () => gameTime;
    (window as Window & { setGardenTestTime?: (nextTime: number) => void }).setGardenTestTime = (nextTime) => {
      gameTime = nextTime;
    };
  }, TEST_START_TIME);
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await page.evaluate(async () => { await document.fonts.ready; return document.fonts.status; });
  await waitForRender(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce');

  const canvas = page.locator('#stage');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  camera.updateMatrixWorld(true);
  const projected = new Vector3(-1.05, 0.65, 2).project(camera);
  const point = {
    x: rect!.x + (projected.x + 1) * rect!.width / 2,
    y: rect!.y + (1 - projected.y) * rect!.height / 2,
  };
  const coins = page.getByRole('status', { name: 'Coins' });
  await expect(coins).toHaveText('12');

  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(coins).toHaveText('11');
  return { plantedAt: TEST_START_TIME, suffix, point, viewport };
}

test('captures production planting dust after a real plot tap', async ({ page }, info) => {
  test.setTimeout(60_000);
  const { plantedAt, suffix, point, viewport } = await plantFirstPlot(page, info.project.name);
  const clip = plotGroundClip(point, viewport);
  const beforeDust = await page.screenshot({ clip, scale: 'css', animations: 'allow' });
  // Let the puff spread while it is still active.
  await setGameTime(page, plantedAt + 180);
  expect(await page.evaluate((start) => Date.now() - start, plantedAt)).toBe(180);
  const duringDust = await page.screenshot({ clip, scale: 'css', animations: 'allow' });
  expect(await changedPixelCount(page, beforeDust, duringDust)).toBeGreaterThan(8);
  await page.screenshot({
    path: `docs/art/evidence/m1-12a-planting-dust-${suffix}.png`,
    scale: 'css',
    animations: 'allow',
  });
});

test('captures a production growth stage accent after real timestamp growth', async ({ page }, info) => {
  test.setTimeout(60_000);
  const { plantedAt, suffix, point, viewport } = await plantFirstPlot(page, info.project.name);
  // Capture the plot ground just before Sunny Sprout reaches Growing, then
  // again shortly after the production sim relays the stage event.
  await setGameTime(page, plantedAt + 2_950);
  const clip = plotGroundClip(point, viewport);
  const beforeEvent = await page.screenshot({ clip, scale: 'css', animations: 'allow' });
  await setGameTime(page, plantedAt + 3_050);
  expect(await page.evaluate((start) => Date.now() - start, plantedAt)).toBe(3_050);
  const duringEvent = await page.screenshot({ clip, scale: 'css', animations: 'allow' });
  expect(await changedPixelCount(page, beforeEvent, duringEvent)).toBeGreaterThan(8);
  await page.screenshot({
    path: `docs/art/evidence/m1-12a-stage-accent-${suffix}.png`,
    scale: 'css',
    animations: 'allow',
  });
});

test('production reduced motion keeps the stage accent fixed for 120ms and suppresses leaf flicks', async ({ page }, info) => {
  test.setTimeout(90_000);
  const { plantedAt, suffix, point, viewport } = await plantFirstPlot(page, info.project.name, 'reduce');
  await setGameTime(page, plantedAt + 3_030);
  expect(await page.evaluate((start) => Date.now() - start, plantedAt)).toBe(3_030);
  const clip = plotGroundClip(point, viewport);
  await setGameTime(page, plantedAt + 3_090);
  const accentGround = await page.screenshot({ clip, scale: 'css', animations: 'allow' });
  await page.screenshot({
    path: `docs/art/evidence/m1-12a-stage-accent-reduced-motion-${suffix}.png`,
    scale: 'css',
    animations: 'allow',
  });
  await setGameTime(page, plantedAt + 3_151);
  const fadedGround = await page.screenshot({ clip, scale: 'css', animations: 'allow' });
  expect(await changedPixelCount(page, accentGround, fadedGround)).toBeGreaterThan(4);

  // Freeze simulation time while RAF continues. The Growing plant rejects
  // Harvest, so a render can apply a flick without changing the plant pose.
  // Capture both frames after the stage accent has finished fading.
  await setGameTime(page, plantedAt + 3_401);
  await waitForRender(page);
  const plantClip = plotPlantClip(point, viewport);
  const beforeTouch = await page.screenshot({ clip: plantClip, scale: 'css', animations: 'allow' });
  if (info.project.name === 'mobile-portrait') await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await waitForRender(page);
  const afterTouch = await page.screenshot({ clip: plantClip, scale: 'css', animations: 'allow' });
  expect(afterTouch.equals(beforeTouch)).toBe(true);
});

test('normal-motion plot touch applies a leaf flick on the next render', async ({ page }, info) => {
  test.setTimeout(60_000);
  const { point } = await plantFirstPlot(page, info.project.name);
  await setGameTime(page, TEST_START_TIME + 3_130);
  const canvas = page.locator('#stage');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const plantClip = plotPlantClip(point, { width: rect!.width, height: rect!.height });
  const beforeTouch = await page.screenshot({ clip: plantClip, scale: 'css', animations: 'allow' });
  if (info.project.name === 'mobile-portrait') await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await setGameTime(page, TEST_START_TIME + 3_250);
  const afterTouch = await page.screenshot({ clip: plantClip, scale: 'css', animations: 'allow' });
  expect(afterTouch.equals(beforeTouch)).toBe(false);
});

