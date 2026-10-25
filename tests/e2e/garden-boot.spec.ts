import { expect, test } from '@playwright/test';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { createGarden } from '../../src/render/garden';
import { createMaterialLibrary } from '../../src/render/materials';

function projectedGardenBottomNdc(width: number, height: number): number {
  const materials = createMaterialLibrary();
  const garden = createGarden();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, width, height);
  camera.updateMatrixWorld(true);
  garden.updateMatrixWorld(true);
  let bottom = Number.POSITIVE_INFINITY;
  garden.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || object.name === 'day-sky-gradient') return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const screenPoint = new Vector3().fromBufferAttribute(positions, index)
        .applyMatrix4(object.matrixWorld).project(camera);
      bottom = Math.min(bottom, screenPoint.y);
    }
  });
  garden.dispose();
  materials.dispose();
  return bottom;
}

test('production garden boots with its HUD clear of the garden', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const projectViewport = testInfo.project.name === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 };
  await page.setViewportSize(projectViewport);
  await page.goto('http://localhost:4173/mutation-garden/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const canvas = page.locator('#stage');
  const seedLabel = page.locator('nav[aria-label="Seeds"] .garden-ui__tray-label');
  await expect(seedLabel).toBeVisible();
  const canvasRect = await canvas.boundingBox();
  const labelRect = await seedLabel.boundingBox();
  expect(canvasRect).not.toBeNull();
  expect(labelRect).not.toBeNull();
  const islandBottomNdc = projectedGardenBottomNdc(canvasRect!.width, canvasRect!.height);
  const islandBottomY = canvasRect!.y + (1 - islandBottomNdc) * canvasRect!.height / 2;
  expect(islandBottomY).toBeLessThan(labelRect!.y - 16);

  expect(errors).toEqual([]);
});

test('photo mode hides the HUD and can be exited from its camera control', async ({ page }) => {
  await page.goto('http://localhost:4173/mutation-garden/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const coins = page.getByRole('status', { name: 'Coins' });
  await page.getByRole('button', { name: 'Photo mode' }).click();
  await expect(coins).toBeHidden();
  const exit = page.getByRole('button', { name: 'Exit photo mode' });
  await expect(exit).toHaveAttribute('aria-pressed', 'true');
  await exit.click();
  await expect(coins).toBeVisible();
});

test('accessibility toggles expose haptics and large text state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const haptics = page.getByRole('button', { name: 'Haptics' });
  const largeText = page.getByRole('button', { name: 'Large text' });
  await haptics.click();
  await expect(haptics).toHaveAttribute('aria-pressed', 'true');
  await largeText.click();
  await expect(largeText).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveClass(/garden-large-text/);
});

test('daily garden starts as a four-plot challenge and returns to the saved garden route', async ({ page }) => {
  await page.goto('./?daily');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByRole('button', { name: /Exit daily garden/ })).toHaveAttribute('title', /back two beds are closed/);
  await expect(page.locator('.garden-ui__hint')).toHaveText('Daily: sell the highest-value fruit. Back two beds are closed. Best sale: 0.');
  const daily = page.getByRole('button', { name: /Exit daily garden/ });
  await expect(daily).toHaveText('Exit daily');
  if (page.viewportSize()?.width === 390) await expect(page.locator('.garden-ui__journal')).toHaveText('Journal');
  await daily.click();
  await expect(page).toHaveURL(/\/mutation-garden\/$/);
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
});
