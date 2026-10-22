import { expect, test } from '@playwright/test';
import { startWithSave } from './garden-save';

// These specs use seeds that unlock at levels 2 and 3, so they start from a level-3 save.
test.beforeEach(async ({ page }) => startWithSave(page));

const pageErrors = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
};

const sizeFor = (project: string) => project === 'desktop'
  ? { width: 1280, height: 800 }
  : { width: 390, height: 844 };

test('renders Bubble Berry stages and a readable 48px silhouette', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(sizeFor(info.project.name));
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/bubble-berry.html');
  await expect(page).toHaveTitle('Bubble Berry render fixture');
  await expect(page.locator('#status')).toHaveAttribute('data-render', 'complete');
  await expect(page.locator('#status')).toHaveAttribute('data-frame', 'ready');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.locator('#stage-strip span')).toHaveText(['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable']);
  const stageHeights = JSON.parse((await page.locator('#status').getAttribute('data-stage-heights'))!) as number[];
  expect(stageHeights).toHaveLength(5);
  expect(stageHeights[1]).toBeGreaterThan(stageHeights[0]!);
  expect(stageHeights[2]).toBeGreaterThan(stageHeights[1]!);
  expect(stageHeights[3]).toBeGreaterThan(stageHeights[2]!);
  const silhouette = page.locator('#silhouette');
  await expect(silhouette).toHaveCSS('width', '48px');
  await expect(silhouette).toHaveCSS('height', '48px');
  await expect(silhouette).toHaveJSProperty('width', 48);
  await expect(silhouette).toHaveJSProperty('height', 48);
  const pixels = await silhouette.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    gl.finish();
    const rgba = new Uint8Array(48 * 48 * 4);
    gl.readPixels(0, 0, 48, 48, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    const rows: number[] = []; const columns: number[] = []; let count = 0; let visible = 0; let touchesEdge = false;
    for (let index = 0; index < rgba.length; index += 4) {
      const [red, green, blue, alpha] = rgba.slice(index, index + 4);
      if (alpha! > 10) {
        const pixel = index / 4;
        const x = pixel % 48;
        const y = Math.floor(pixel / 48);
        visible += 1; rows.push(47 - y); columns.push(x);
        if (x === 0 || x === 47 || y === 0 || y === 47) touchesEdge = true;
        if (Math.max(red!, green!, blue!) < 100) count += 1;
      }
    }
    return {
      count,
      visible,
      touchesEdge,
      width: columns.length ? Math.max(...columns) - Math.min(...columns) + 1 : 0,
      height: rows.length ? Math.max(...rows) - Math.min(...rows) + 1 : 0,
    };
  });
  expect(pixels.count, JSON.stringify(pixels)).toBeGreaterThan(40);
  expect(pixels.width).toBeGreaterThanOrEqual(34);
  expect(pixels.width).toBeLessThanOrEqual(42);
  expect(pixels.height).toBeGreaterThanOrEqual(12);
  expect(pixels.touchesEdge, JSON.stringify(pixels)).toBe(false);
  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({ path: `test-results/evidence/m1-08b1-bubble-berry-${view}-stages.png`, scale: 'css' });
  expect(errors).toEqual([]);
});

test('keeps six ripe Bubble Berry plants below the garden draw-call budget', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(sizeFor(info.project.name));
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/bubble-berry.html?six-ripe');
  const status = page.locator('#status');
  await expect(status).toHaveAttribute('data-render', 'complete');
  await expect(status).toHaveAttribute('data-frame', 'ready');
  await expect(status).toHaveText('Ready');
  await expect(status).toHaveAttribute('data-plants', '6');
  await expect(status).toHaveAttribute('data-ripe', '6');
  const calls = Number(await status.getAttribute('data-draw-calls'));
  expect(calls).toBeLessThan(150);
  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({ path: `test-results/evidence/m1-08b1-bubble-berry-${view}-six-ripe.png`, scale: 'css' });
  expect(errors).toEqual([]);
});

test('renders six ripe plants across all three species below the garden draw-call budget', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(sizeFor(info.project.name));
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/bubble-berry.html?six-ripe&mixed');
  const status = page.locator('#status');
  await expect(status).toHaveAttribute('data-render', 'complete');
  await expect(status).toHaveAttribute('data-frame', 'ready');
  await expect(status).toHaveText('Ready');
  await expect(status).toHaveAttribute('data-plants', '6');
  await expect(status).toHaveAttribute('data-ripe', '6');
  await expect(status).toHaveAttribute('data-species-order', JSON.stringify([
    'sunny-sprout', 'bubble-berry', 'twistroot', 'sunny-sprout', 'bubble-berry', 'twistroot',
  ]));
  const calls = Number(await status.getAttribute('data-draw-calls'));
  expect(calls).toBeLessThan(150);
  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({ path: `test-results/evidence/m1-08b1-mixed-six-ripe-${view}.png`, scale: 'css' });
  expect(errors).toEqual([]);
});
