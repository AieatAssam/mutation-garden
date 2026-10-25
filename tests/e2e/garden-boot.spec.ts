import { expect, test } from '@playwright/test';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { createGarden } from '../../src/render/garden';
import { createMaterialLibrary } from '../../src/render/materials';
import { xpForLevel } from '../../src/sim';
import { startWithSave } from './garden-save';

async function touchDrag(page: import('@playwright/test').Page, source: import('@playwright/test').Locator, target: import('@playwright/test').Locator): Promise<void> {
  const from = await source.boundingBox(); const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag targets must be visible.');
  const startX = from.x + from.width / 2; const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2; const endY = to.y + to.height / 2;
  await source.dispatchEvent('pointerdown', {
      bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
      clientX: startX, clientY: startY, buttons: 1,
  });
  await page.evaluate(({ endX, endY }) => {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: endX, clientY: endY, buttons: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: endX, clientY: endY, buttons: 0 }));
  }, { endX, endY });
}

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

test('laboratory stays locked until level 18', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByRole('button', { name: 'Open laboratory' })).toBeHidden();
});

test('laboratory opens at level 18 and returns to the garden', async ({ page }) => {
  await startWithSave(page, xpForLevel(18));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await page.getByRole('button', { name: 'Open laboratory' }).click();
  await expect(page.getByRole('heading', { name: 'Mutation Laboratory' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close laboratory' })).toBeFocused();
  await expect(page.getByRole('group', { name: 'Drop fruit into the glass jar' })).toBeVisible();
  await page.getByRole('button', { name: 'Close laboratory' }).click();
  await expect(page.getByRole('heading', { name: 'Mutation Laboratory' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open laboratory' })).toBeFocused();
});

test('touch-ready lab flow transfers touching specimens and awards their deterministic seed', async ({ page }) => {
  await startWithSave(page, xpForLevel(18), { crateMutations: [['frozen'], ['electric']] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await page.getByRole('button', { name: 'Open laboratory' }).click();
  const jar = page.getByRole('group', { name: 'Drop fruit into the glass jar' });
  await touchDrag(page, page.locator('.laboratory__fruit-card').nth(0), jar);
  await expect(page.locator('.laboratory__specimen')).toHaveCount(1);
  await touchDrag(page, page.locator('.laboratory__fruit-card').nth(0), jar);
  await expect(page.locator('.laboratory__seed')).toHaveText('prism fig seed packet');
  await page.getByRole('button', { name: 'Close laboratory' }).click();
  await page.getByRole('button', { name: /Journal/ }).click();
  await expect(page.getByText('Frozen + Electric → Prism Fig')).toBeVisible();
  await page.locator('.discovery-journal__close').click();
  const seed = page.locator('button[data-species-id="prism-fig"]');
  await expect(seed).toBeVisible();
  await seed.click();
  await expect(seed).toHaveAttribute('aria-pressed', 'true');
});

test('invalid lab specimens can be returned to the crate', async ({ page }) => {
  await startWithSave(page, xpForLevel(18), { crateMutations: [['frozen'], ['golden']] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await page.getByRole('button', { name: 'Open laboratory' }).click();
  const jar = page.getByRole('group', { name: 'Drop fruit into the glass jar' });
  await touchDrag(page, page.locator('.laboratory__fruit-card').first(), jar);
  await page.locator('.laboratory__specimen').first().click();
  await page.getByRole('button', { name: 'Return selected' }).click();
  await expect(page.locator('.laboratory__specimen')).toHaveCount(0);
  await expect(page.locator('.laboratory__fruit-card')).toHaveCount(2);
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

test('fresh and late-game gardens boot without browser errors', async ({ browser }) => {
  const scenarios = [
    { name: 'fresh', save: false },
    { name: 'late game', save: true },
  ];
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    if (scenario.save) {
      await startWithSave(page, xpForLevel(18), {
        coins: 2_000,
        owned: ['sprinkler', 'bee-hive', 'harvest-helper', 'delivery-cart'],
        twistrootPlantedAt: Date.now() - 60_000,
        twistrootMutations: ['golden', 'twin'],
        crateMutations: [['frozen'], ['electric']],
      });
    }
    await page.goto('http://localhost:4173/mutation-garden/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
    if (scenario.save) await expect(page.getByRole('button', { name: 'Open laboratory' })).toBeVisible();
    expect(errors, `${scenario.name} save`).toEqual([]);
    await context.close();
  }
});
