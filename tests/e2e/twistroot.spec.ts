import { expect, test } from '@playwright/test';

const pageErrors = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
};

const sizeFor = (project: string) => project === 'desktop'
  ? { width: 1280, height: 800 }
  : { width: 390, height: 844 };

test('renders all Twistroot stages, a readable 48px silhouette, and stable reduced motion', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(sizeFor(info.project.name));
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/bubble-berry.html?species=twistroot');
  await expect(page).toHaveTitle('Twistroot render fixture');
  const status = page.locator('#status');
  await expect(status).toHaveAttribute('data-render', 'complete');
  await expect(status).toHaveAttribute('data-frame', 'ready');
  await expect(status).toHaveAttribute('data-webgl-error', 'false');
  await expect(status).toHaveAttribute('data-reduced-motion-stable', 'true');
  await expect(status).toHaveText('Ready');
  await expect(page.locator('#stage-strip span')).toHaveText(['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable']);
  const silhouette = page.locator('#silhouette');
  const stageHeights = JSON.parse((await status.getAttribute('data-stage-heights'))!) as number[];
  expect(stageHeights).toHaveLength(5);
  expect(stageHeights[1]).toBeGreaterThan(stageHeights[0]!);
  expect(stageHeights[2]).toBeGreaterThan(stageHeights[1]!);
  expect(stageHeights[3]).toBeGreaterThan(stageHeights[2]!);
  const changedBodyPixels = Number(await silhouette.getAttribute('data-stage-body-pixel-difference'));
  expect(changedBodyPixels).toBeGreaterThan(24);

  await expect(silhouette).toHaveAttribute('aria-label', 'Twistroot silhouette');
  await expect(silhouette).toHaveCSS('width', '48px');
  await expect(silhouette).toHaveCSS('height', '48px');
  await expect(silhouette).toHaveJSProperty('width', 48);
  await expect(silhouette).toHaveJSProperty('height', 48);
  const pixels = await silhouette.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    gl.finish();
    const rgba = new Uint8Array(48 * 48 * 4);
    gl.readPixels(0, 0, 48, 48, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const columns: number[] = []; const rows: number[] = []; let visible = 0; let touchesEdge = false;
    for (let index = 0; index < rgba.length; index += 4) {
      if (rgba[index + 3]! <= 10) continue;
      const pixel = index / 4; const x = pixel % 48; const y = Math.floor(pixel / 48);
      visible += 1; columns.push(x); rows.push(y);
      if (x === 0 || x === 47 || y === 0 || y === 47) touchesEdge = true;
    }
    return {
      visible,
      touchesEdge,
      width: columns.length ? Math.max(...columns) - Math.min(...columns) + 1 : 0,
      height: rows.length ? Math.max(...rows) - Math.min(...rows) + 1 : 0,
    };
  });
  expect(pixels.visible, JSON.stringify(pixels)).toBeGreaterThan(40);
  expect(pixels.width).toBeGreaterThanOrEqual(20);
  expect(pixels.height).toBeGreaterThanOrEqual(44);
  expect(pixels.height).toBeLessThanOrEqual(48);
  expect(pixels.touchesEdge, JSON.stringify(pixels)).toBe(false);

  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({ path: `test-results/evidence/m1-08c1-twistroot-${view}-stages.png`, scale: 'css' });
  expect(errors).toEqual([]);
});

test('keeps six ripe Twistroot plants below the garden draw-call budget', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(sizeFor(info.project.name));
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/bubble-berry.html?species=twistroot&six-ripe');
  const status = page.locator('#status');
  await expect(status).toHaveAttribute('data-render', 'complete');
  await expect(status).toHaveAttribute('data-frame', 'ready');
  await expect(status).toHaveAttribute('data-webgl-error', 'false');
  await expect(status).toHaveText('Ready');
  await expect(status).toHaveAttribute('data-plants', '6');
  await expect(status).toHaveAttribute('data-ripe', '6');
  const calls = Number(await status.getAttribute('data-draw-calls'));
  expect(calls).toBeLessThan(150);
  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({ path: `test-results/evidence/m1-08c1-twistroot-${view}-six-ripe.png`, scale: 'css' });
  expect(errors).toEqual([]);
});
