import { expect, test } from '@playwright/test';

const pageErrors = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
};

test('sunny sprout renders all stages and reduced motion', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(info.project.name === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/sunny-sprout.html');
  await expect(page.locator('#status')).toHaveAttribute('data-render', 'complete');
  await page.evaluate(() => document.fonts.ready); await expect(page.locator('#stage-strip')).toBeVisible();
  await expect(page.locator('#stage-strip > span')).toHaveText(['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable']);
  const silhouette = page.locator('#silhouette');
  await expect(silhouette).toHaveJSProperty('tagName', 'CANVAS');
  await expect(silhouette).toHaveCSS('width', '48px'); await expect(silhouette).toHaveCSS('height', '48px');
  await expect(silhouette).toHaveJSProperty('width', 48); await expect(silhouette).toHaveJSProperty('height', 48);
  expect(Number(await silhouette.getAttribute('data-projected-height'))).toBeCloseTo(48, 1);
  const ink = await silhouette.evaluate((element) => { const gl = (element as HTMLCanvasElement).getContext('webgl2')!; gl.finish(); const data = new Uint8Array(48 * 48 * 4); gl.readPixels(0, 0, 48, 48, gl.RGBA, gl.UNSIGNED_BYTE, data); const rows: number[] = []; let count = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 0 && Math.abs(data[i]! - 43) < 12 && Math.abs(data[i + 1]! - 30) < 12 && Math.abs(data[i + 2]! - 46) < 12) { count += 1; rows.push(47 - Math.floor(i / 4 / 48)); } return { count, min: Math.min(...rows), max: Math.max(...rows) }; });
  expect(ink.count).toBeGreaterThan(0); expect(ink.min).toBeLessThanOrEqual(1); expect(ink.max).toBeGreaterThanOrEqual(46);
  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.evaluate(() => (window as unknown as Window & { sunnySproutFixture: { pause(): void } }).sunnySproutFixture.pause());
  await expect(page.locator('#status')).toHaveAttribute('data-frame', 'paused');
  await page.screenshot({ path: `test-results/evidence/m1-08a1-sunny-sprout-${view}-default.png` });
  await page.locator('#reduced-motion').check(); await expect(page.locator('#reduced-motion')).toBeChecked();
  await page.evaluate(() => (window as unknown as Window & { sunnySproutFixture: { setMotion(value: boolean): void } }).sunnySproutFixture.setMotion(true));
  await expect(page.locator('#status')).toHaveAttribute('data-motion', 'reduced');
  await page.screenshot({ path: `test-results/evidence/m1-08a1-sunny-sprout-${view}-reduced.png` }); expect(errors).toEqual([]);
});

test('reconciles visible growth, harvest and replant snapshots across layouts', async ({ page }, info) => {
  const errors = pageErrors(page);
  await page.setViewportSize(info.project.name === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/sunny-sprout.html?reconcile');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'reconcile');
  await expect(page.locator('#status')).toHaveAttribute('data-render', 'complete');
  await expect(page.locator('#stage-strip')).toBeHidden(); await expect(page.locator('#silhouette')).toBeHidden();
  const canvas = page.locator('#stage'); await expect(canvas).toBeVisible();
  const renderCase = async (name: string) => {
    await page.evaluate((value) => (window as unknown as Window & { sunnySproutFixture: { setCase(name: string): void } }).sunnySproutFixture.setCase(value), name);
    await expect(page.locator('#status')).toHaveAttribute('data-case', name);
    return canvas.screenshot();
  };
  const empty = await renderCase('empty'); const growing = await renderCase('growing'); const harvested = await renderCase('harvested');
  const replanted = await renderCase('replanted'); const sixPlots = await renderCase('six-plots');
  expect(growing.equals(empty)).toBe(false); expect(harvested.equals(empty)).toBe(true); expect(harvested.equals(replanted)).toBe(false);
  expect(replanted.equals(sixPlots)).toBe(false);
  const view = info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await canvas.screenshot({ path: `test-results/evidence/m1-08a2-sunny-sprout-${view}-six-plots.png` });
  await page.evaluate(() => (window as unknown as Window & { sunnySproutFixture: { setMotion(value: boolean): void } }).sunnySproutFixture.setMotion(true));
  await expect(page.locator('#reduced-motion')).toBeChecked(); const reduced = await canvas.screenshot({ path: `test-results/evidence/m1-08a2-sunny-sprout-${view}-reduced-motion.png` });
  await page.evaluate(() => (window as unknown as Window & { sunnySproutFixture: { setMotion(value: boolean): void } }).sunnySproutFixture.setMotion(false));
  await expect(page.locator('#reduced-motion')).not.toBeChecked(); expect(reduced.equals(sixPlots)).toBe(false);
  expect(errors).toEqual([]);
});
