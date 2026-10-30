import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, setGardenCameraExpanded } from '../../src/render/camera';
import { mutationRoll, nextRandom, SHOP_PRICES, xpForLevel } from '../../src/sim';
import { startWithSave } from './garden-save';

test('buy Plot 7 and water Bubble Berry twice for Giant', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const size = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  await page.setViewportSize(size);
  const mutationRngState = Array.from({ length: 100_000 }, (_, i) => i + 1).find((value) => {
    const mutationSeed = Math.floor(nextRandom(value).value * 0x1_0000_0000);
    return mutationRoll(mutationSeed, 'golden') >= 0.01 && mutationRoll(mutationSeed, 'glowing') >= 0.01;
  })!;
  await startWithSave(page, xpForLevel(3), {
    coins: SHOP_PRICES['plot-6'] + 5, mutationRngState, plantCount: 100,
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const shopButton = page.getByRole('button', { name: 'Shop' });
  if (mobile) await shopButton.tap(); else await shopButton.click();
  const plot7 = page.locator('.garden-ui__shop-row').filter({ hasText: 'Plot 7' });
  await expect(plot7).toBeVisible();
  const quickCounter1 = page.locator('.garden-ui__shop-row').filter({ has: page.getByText('Quick Counter I', { exact: true }) });
  const quickCounter2 = page.locator('.garden-ui__shop-row').filter({ has: page.getByText('Quick Counter II', { exact: true }) });
  await expect(quickCounter1).toContainText('Level 4 · 45 coins');
  await expect(quickCounter2.getByRole('button')).toHaveText('Requires Quick Counter I');
  const buyPlot7 = plot7.getByRole('button', { name: `Buy · ${SHOP_PRICES['plot-6']}` });
  if (mobile) await buyPlot7.tap(); else await buyPlot7.click();
  await expect(page.getByRole('button', { name: 'Shop' })).toBeVisible();
  if (mobile) await page.touchscreen.tap(8, 170); else await page.mouse.click(8, 170);
  await expect(page.locator('.garden-ui__shop-backdrop')).toBeHidden();
  if (mobile) await shopButton.tap(); else await shopButton.click();
  if (mobile) await page.getByRole('button', { name: 'Close' }).tap(); else await page.getByRole('button', { name: 'Close' }).click();
  const bubbleBerry = page.getByRole('navigation', { name: 'Seeds' }).getByRole('button', { name: 'Bubble Berry' });
  if (mobile) await bubbleBerry.tap(); else await bubbleBerry.click();
  await page.waitForTimeout(500);

  const canvas = page.locator('#stage');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  setGardenCameraExpanded(camera, true);
  camera.updateMatrixWorld(true);
  const projectPoint = (worldY: number) => {
    const projected = new Vector3(-5.25, worldY, 0).project(camera);
    return { x: rect!.x + (projected.x + 1) * rect!.width / 2, y: rect!.y + (1 - projected.y) * rect!.height / 2 };
  };
  const point = projectPoint(0.65);
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('0');
  await page.waitForTimeout(2_600);
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(page.locator('.garden-ui__hint')).toHaveText('Water it again to grow a Giant.');
  await page.waitForTimeout(3_000);
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(page.getByText('New mutation: Giant!')).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('120');
  if (mobile) await page.touchscreen.tap(10, 10); else await page.mouse.click(10, 10);
  await expect(page.getByText('New mutation: Giant!')).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('120');
});

test('Plot 8 stays locked until bought, then accepts a plant', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const size = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize(size);
  await startWithSave(page, xpForLevel(4), {
    coins: SHOP_PRICES['plot-6'] + SHOP_PRICES['plot-7'] + 8,
    plantCount: 100,
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');

  const activate = async (x: number, y: number) => {
    if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  };
  const clickButton = async (button: ReturnType<typeof page.getByRole>) => {
    if (mobile) await button.tap(); else await button.click();
  };
  const shopButton = page.getByRole('button', { name: 'Shop' });
  await clickButton(shopButton);
  const plot7 = page.locator('.garden-ui__shop-row').filter({ hasText: 'Plot 7' });
  await expect(plot7).toBeVisible();
  const buyPlot7 = plot7.getByRole('button', { name: `Buy · ${SHOP_PRICES['plot-6']}` });
  if (mobile) await buyPlot7.tap(); else await buyPlot7.click();
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText(String(SHOP_PRICES['plot-7'] + 8));
  await clickButton(page.getByRole('button', { name: 'Close' }));
  await expect(page.locator('.garden-ui__shop-backdrop')).toBeHidden();

  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const sunny = seeds.getByRole('button', { name: 'Sunny Sprout' });
  if (mobile) await sunny.tap(); else await sunny.click();
  const canvas = page.locator('#stage');
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  setGardenCameraExpanded(camera, true);
  camera.updateMatrixWorld(true);
  const projected = new Vector3(-7.35, 0.65, 0).project(camera);
  const point = {
    x: rect!.x + (projected.x + 1) * rect!.width / 2,
    y: rect!.y + (1 - projected.y) * rect!.height / 2,
  };
  await activate(point.x, point.y);
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText(String(SHOP_PRICES['plot-7'] + 8));

  await clickButton(shopButton);
  const plot8 = page.locator('.garden-ui__shop-row').filter({ hasText: 'Plot 8' });
  const buyPlot8 = plot8.getByRole('button', { name: `Buy · ${SHOP_PRICES['plot-7']}` });
  if (mobile) await buyPlot8.tap(); else await buyPlot8.click();
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('8');
  await clickButton(page.getByRole('button', { name: 'Close' }));
  await expect(page.locator('.garden-ui__shop-backdrop')).toBeHidden();

  let coins = 8;
  const plantAt = async (x: number, z: number) => {
    const projected = new Vector3(x, 0.65, z).project(camera);
    const screenX = rect!.x + (projected.x + 1) * rect!.width / 2;
    const screenY = rect!.y + (1 - projected.y) * rect!.height / 2;
    await activate(
      screenX,
      screenY,
    );
    coins -= 1;
    await expect(page.getByRole('status', { name: 'Coins' }), `plant at ${x}, ${z}`).toHaveText(String(coins));
  };
  await activate(point.x, point.y);
  coins -= 1;
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText(String(coins));
  if (!mobile) {
    const ground = new Vector3(0, 0.48, -3.2).project(camera);
    const start = {
      x: rect!.x + (ground.x + 1) * rect!.width / 2,
      y: rect!.y + (1 - ground.y) * rect!.height / 2,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y - 140, { steps: 6 });
    await page.mouse.up();
    panGardenCamera(camera, 0, -130, rect!.width, rect!.height);
    camera.updateMatrixWorld(true);
  }
  for (const [x, z] of [[-1.05, 2], [1.05, 2], [-1.05, 0], [1.05, 0], [-1.05, -2], [1.05, -2], [-5.25, 0]] as const) {
    await plantAt(x, z);
  }
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('0');
  expect(errors).toEqual([]);
});
