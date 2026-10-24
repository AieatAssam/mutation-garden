import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera, setGardenCameraExpanded } from '../../src/render/camera';
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
    coins: SHOP_PRICES['plot-6'] + 3, mutationRngState, plantCount: 100,
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
