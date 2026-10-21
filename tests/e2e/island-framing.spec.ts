import { expect, test } from '@playwright/test';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { createGarden } from '../../src/render/garden';
import { createMaterialLibrary } from '../../src/render/materials';

const plotWorldCenters = [
  [-1.05, 0.65, 2], [1.05, 0.65, 2],
  [-1.05, 0.65, 0], [1.05, 0.65, 0],
  [-1.05, 0.65, -2], [1.05, 0.65, -2],
] as const;

function projectedIslandBounds(width: number, height: number) {
  const materials = createMaterialLibrary();
  const garden = createGarden();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, width, height);
  camera.updateMatrixWorld(true);
  garden.updateMatrixWorld(true);
  const bounds = { left: 1, right: -1, top: -1, bottom: 1 };
  garden.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh || object.name === 'day-sky-gradient') return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const point = new Vector3().fromBufferAttribute(positions, index)
        .applyMatrix4(object.matrixWorld).project(camera);
      bounds.left = Math.min(bounds.left, point.x);
      bounds.right = Math.max(bounds.right, point.x);
      bounds.top = Math.max(bounds.top, point.y);
      bounds.bottom = Math.min(bounds.bottom, point.y);
    }
  });
  garden.dispose();
  materials.dispose();
  return bounds;
}

test('production garden balances the portrait island and keeps all six plots tappable at default zoom', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');

  const canvas = page.locator('#stage');
  const coins = page.getByRole('status', { name: 'Coins' });
  const seedLabel = page.locator('nav[aria-label="Seeds"] .garden-ui__tray-label');
  await expect(canvas).toBeVisible();
  await expect(coins).toHaveText('12');
  await expect(seedLabel).toBeVisible();
  await page.screenshot({
    path: mobile
      ? 'test-results/evidence/m1-07e1-framing-phone-390x844.png'
      : 'test-results/evidence/m1-07e1-framing-desktop-1280x800.png',
    fullPage: false,
    scale: 'css',
    animations: 'disabled',
  });

  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, rect!.width, rect!.height);
  camera.updateMatrixWorld(true);
  const plotPoints = plotWorldCenters.map(([x, y, z]) => {
    const point = new Vector3(x, y, z).project(camera);
    return {
      x: rect!.x + (point.x + 1) * rect!.width / 2,
      y: rect!.y + (1 - point.y) * rect!.height / 2,
    };
  });

  const island = projectedIslandBounds(rect!.width, rect!.height);
  const islandTop = rect!.y + (1 - island.top) * rect!.height / 2;
  const islandBottom = rect!.y + (1 - island.bottom) * rect!.height / 2;
  let portraitGapDifference = 0;
  let skyGap = 0;
  let trayGap = 0;
  if (mobile) {
    const coinBox = await coins.boundingBox();
    const seedBox = await seedLabel.boundingBox();
    expect(coinBox).not.toBeNull();
    expect(seedBox).not.toBeNull();
    skyGap = islandTop - (coinBox!.y + coinBox!.height);
    trayGap = seedBox!.y - islandBottom;
    expect(skyGap, 'the island leaves usable space below the coin counter').toBeGreaterThanOrEqual(0);
    expect(trayGap, 'the island leaves usable space above the seed tray').toBeGreaterThanOrEqual(0);
    portraitGapDifference = Math.abs(skyGap - trayGap);
  }

  for (let index = 0; index < plotPoints.length; index += 1) {
    const point = plotPoints[index]!;
    expect(point.x, `plot-${index} stays inside the canvas`).toBeGreaterThanOrEqual(rect!.x);
    expect(point.x, `plot-${index} stays inside the canvas`).toBeLessThan(rect!.x + rect!.width);
    expect(point.y, `plot-${index} stays inside the canvas`).toBeGreaterThanOrEqual(rect!.y);
    expect(point.y, `plot-${index} stays inside the canvas`).toBeLessThan(rect!.y + rect!.height);
    if (mobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
  }
  // Six distinct taps at one coin each must all succeed: partial or duplicate
  // activations leave a higher balance, so the final exact balance proves every plot.
  await expect(coins).toHaveText('6');
  if (mobile) {
    expect(portraitGapDifference,
      `portrait space above and below the island is balanced (top ${skyGap.toFixed(1)} px, bottom ${trayGap.toFixed(1)} px)`)
      .toBeLessThanOrEqual(viewport.height * 0.15);
  }
  expect(errors).toEqual([]);
});
