import { expect, test, type Page } from '@playwright/test';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { createGarden } from '../../src/render/garden';
import { createMaterialLibrary } from '../../src/render/materials';

type Probe = {
  inspect(): { canvasRect: { left: number; top: number; width: number; height: number }; plots: { plotId: string; x: number; y: number }[]; ground: { x: number; y: number }; sky: { x: number; y: number } };
  pick(x: number, y: number): { kind: 'plot'; plotId: string } | { kind: 'ground' } | null;
  resize(): void;
  setInset(enabled: boolean): void;
  dispose(): void;
};

declare global {
  interface Window { gardenProbe: Probe }
}

const viewports = [
  { width: 390, height: 844 }, { width: 390, height: 896 }, { width: 360, height: 800 },
  { width: 844, height: 390 }, { width: 1280, height: 800 },
];
const offsets: [number, number][] = [[0, 0], [-24, 0], [24, 0], [0, -24], [0, 24], [-24, -24], [-24, 24], [24, -24], [24, 24]];

async function inspect(page: Page) { return page.evaluate(() => window.gardenProbe.inspect()); }

function projectedGardenBottomNdc(width: number, height: number): number {
  const materials = createMaterialLibrary();
  const garden = createGarden(materials);
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

test('production garden renders cleanly and picker covers plot targets across sizes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const desktop = testInfo.project.name === 'desktop';
  await page.setViewportSize(desktop ? { width: 1280, height: 800 } : viewports[0]!);
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-render.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');
  await expect(page.locator('#stage')).toBeVisible();
  const canvasSize = await page.locator('#stage').evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
  }));
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);
  await page.screenshot({
    path: desktop ? 'docs/art/evidence/m1-07c-desktop-1280x800.png' : 'docs/art/evidence/m1-07c-phone-390x844.png',
    fullPage: true,
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.gardenProbe.resize());
    for (const inset of [false, true]) {
      await page.evaluate(value => window.gardenProbe.setInset(value), inset);
      const { canvasRect, plots, ground, sky } = await inspect(page);
      expect(plots.map(plot => plot.plotId)).toEqual(['plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5']);
      const plotCenterSpan = (Math.max(...plots.map(({ x }) => x)) - Math.min(...plots.map(({ x }) => x))) / canvasRect.width;
      const minimumPlotCenterSpan = viewport.height > viewport.width ? 0.4 : 0.2;
      expect(plotCenterSpan, `${viewport.width}x${viewport.height} plot centers remain spread across the view`)
        .toBeGreaterThan(minimumPlotCenterSpan);
      if (inset) {
        expect(canvasRect.left).toBeGreaterThan(0);
        expect(canvasRect.top).toBeGreaterThan(0);
        expect(canvasRect.width).toBeLessThan(viewport.width);
        expect(canvasRect.height).toBeLessThan(viewport.height);
      } else expect(canvasRect).toEqual({ left: 0, top: 0, width: viewport.width, height: viewport.height });

      const plotPicks = await page.evaluate(({ plots: centers, offsets: points }) => centers.flatMap(plot =>
        points.map(([dx, dy]) => ({ plotId: plot.plotId, dx, dy, result: window.gardenProbe.pick(plot.x + dx, plot.y + dy) }))),
      { plots, offsets });
      expect(plotPicks).toHaveLength(54);
      for (const { plotId, dx, dy, result } of plotPicks) {
        expect(result, `${viewport.width}x${viewport.height}, inset=${inset}, ${plotId} offset=(${dx},${dy})`).toEqual({ kind: 'plot', plotId });
      }
      expect(await page.evaluate(({ x, y }) => window.gardenProbe.pick(x, y), ground)).toEqual({ kind: 'ground' });
      expect(await page.evaluate(({ x, y }) => window.gardenProbe.pick(x, y), sky)).toBeNull();
      expect(await page.evaluate(rect => window.gardenProbe.pick(rect.left - 1, rect.top - 1), canvasRect)).toBeNull();
    }
  }

  const lastCenter = (await inspect(page)).plots[0]!;
  await page.evaluate(() => { window.gardenProbe.dispose(); window.gardenProbe.dispose(); window.gardenProbe.resize(); });
  expect(await page.evaluate(({ x, y }) => window.gardenProbe.pick(x, y), lastCenter)).toBeNull();
  expect(errors).toEqual([]);
});

test('keeps the island above the Seeds label with UI space reserved', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const viewport = testInfo.project.name === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
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
});
