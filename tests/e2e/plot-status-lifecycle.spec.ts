import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('harvest status stamps swell, settle, and fade under reduced motion', async ({ page }, testInfo) => {
  const viewport = testInfo.project.name === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('http://127.0.0.1:42741/mutation-garden/tests/e2e/fixtures/plot-status-lifecycle.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');

  const measurements = await page.evaluate(() => {
    const fixture = window as unknown as Window & {
      readPlotStatusLifecycle: () => {
        peakScale: number;
        settledScale: number;
        fadeScale: number;
        fadeOpacity: number;
        pickCount: number;
      };
      presentReducedMotionAt: (elapsedMs: number) => { opacity: number; pickCount: number };
    };
    const initial = fixture.readPlotStatusLifecycle();
    const fadeAtStart = fixture.presentReducedMotionAt(0);
    const fadeAtHalf = fixture.presentReducedMotionAt(60);
    const fadeAtEnd = fixture.presentReducedMotionAt(120);
    fixture.presentReducedMotionAt(60);
    return { ...initial, fadeAtStart, fadeAtHalf, fadeAtEnd };
  });

  expect(measurements.peakScale).toBeCloseTo(1.15, 2);
  expect(measurements.settledScale).toBeCloseTo(1, 3);
  expect(measurements.fadeScale).toBeCloseTo(1, 3);
  expect(measurements.fadeAtStart.opacity).toBeCloseTo(0, 3);
  expect(measurements.fadeAtHalf.opacity).toBeCloseTo(0.5, 2);
  expect(measurements.fadeAtEnd.opacity).toBeCloseTo(1, 3);
  expect(measurements.fadeAtStart.pickCount).toBe(1);
  expect(measurements.fadeAtHalf.pickCount).toBe(1);
  expect(measurements.fadeAtEnd.pickCount).toBe(1);
  expect(measurements.pickCount).toBe(1);

  const screenshotName = testInfo.project.name === 'desktop'
    ? 'plot-status-lifecycle-desktop-1280x800.png'
    : 'plot-status-lifecycle-mobile-390x844.png';
  const screenshotPath = resolve(process.cwd(), 'test-results', screenshotName);
  await mkdir(dirname(screenshotPath), { recursive: true });
  const screenshot = await page.screenshot({ path: screenshotPath });
  await testInfo.attach(screenshotName, {
    body: screenshot,
    contentType: 'image/png',
  });
});
