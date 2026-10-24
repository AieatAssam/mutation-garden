import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { startWithSave } from './garden-save';

async function firstPlot(page: Page, project: string): Promise<{ x: number; y: number }> {
  const viewport = project === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, bounds!.width, bounds!.height);
  camera.updateMatrixWorld(true);
  const point = new Vector3(-1.05, 0.58, 2).project(camera);
  return { x: bounds!.x + (point.x + 1) * bounds!.width / 2, y: bounds!.y + (1 - point.y) * bounds!.height / 2 };
}

async function activate(page: Page, point: { x: number; y: number }, project: string): Promise<void> {
  if (project === 'desktop') await page.mouse.click(point.x, point.y);
  else await page.touchscreen.tap(point.x, point.y);
}

test('harvest fills the crate and a stall sale pays one fruit', async ({ page }, info) => {
  await startWithSave(page, 25, { twistrootPlantedAt: 0 });
  const point = await firstPlot(page, info.project.name);
  await activate(page, point, info.project.name);
  await expect(page.locator('.garden-ui__crate-amount')).toHaveText('1/12');
  const coins = page.locator('.garden-ui__coin-amount');
  const before = Number((await coins.textContent())?.trim());
  await page.getByRole('button', { name: 'Sell' }).click();
  await expect.poll(async () => Number((await coins.textContent())?.trim()), { timeout: 5_000 }).toBeGreaterThan(before);
  await expect(page.locator('.garden-ui__crate-amount')).toHaveText('0/12');
});

test('a full crate rejects harvest and keeps the ripe plant', async ({ page }, info) => {
  await startWithSave(page, 25, { twistrootPlantedAt: 0, crateCount: 12 });
  const point = await firstPlot(page, info.project.name);
  await activate(page, point, info.project.name);
  await expect(page.locator('.garden-ui__crate-amount')).toHaveText('▣ 12/12');
  await expect(page.getByRole('status').filter({ hasText: 'Crate full.' })).toBeVisible();
});
