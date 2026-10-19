import { expect, test } from '@playwright/test';

type Plot = { plotId: string; x: number; y: number };
type Probe = {
  inspect(): { canvasRect: { left: number; top: number; width: number; height: number }; plots: Plot[] };
  pick(x: number, y: number): { kind: 'plot'; plotId: string } | { kind: 'ground' } | null;
  pan(deltaX: number, deltaY: number): void;
};

test('maximum horizontal pan keeps every plot target on screen', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  const desktop = testInfo.project.name === 'desktop';
  const viewport = desktop ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('#stage')).toBeVisible();

  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-render.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');
  const base = await page.evaluate(() =>
    (window as unknown as Window & { gardenProbe: Probe }).gardenProbe.inspect());
  expect(base.canvasRect).toEqual({ left: 0, top: 0, ...viewport });

  const targetOffsets = [[0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24]] as const;
  for (const { edge, deltaX } of [
    { edge: 'left', deltaX: -1e9 },
    { edge: 'right', deltaX: 1e9 },
  ] as const) {
    await page.evaluate(value =>
      (window as unknown as Window & { gardenProbe: Probe }).gardenProbe.pan(value, 0), deltaX);
    const current = await page.evaluate(() =>
      (window as unknown as Window & { gardenProbe: Probe }).gardenProbe.inspect());
    expect(current.plots).toHaveLength(6);
    for (const plot of current.plots) {
      const original = base.plots.find(({ plotId }) => plotId === plot.plotId);
      expect(original).toBeDefined();
      expect(Math.abs(plot.x - original!.x), `${plot.plotId} visibly moves`).toBeGreaterThan(1);
      for (const [dx, dy] of targetOffsets) {
        const x = plot.x + dx;
        const y = plot.y + dy;
        expect(x, `${plot.plotId} target left edge`).toBeGreaterThanOrEqual(8);
        expect(x, `${plot.plotId} target right edge`).toBeLessThanOrEqual(viewport.width - 8);
        expect(y, `${plot.plotId} target top edge`).toBeGreaterThanOrEqual(0);
        expect(y, `${plot.plotId} target bottom edge`).toBeLessThanOrEqual(viewport.height);
        expect(await page.evaluate(({ x: px, y: py }) =>
          (window as unknown as Window & { gardenProbe: Probe }).gardenProbe.pick(px, py), { x, y }))
          .toEqual({ kind: 'plot', plotId: plot.plotId });
      }
    }

    await page.screenshot({
      path: desktop
        ? `docs/art/evidence/m1-17a1b-pan-envelope-desktop-${edge}-1280x800.png`
        : `docs/art/evidence/m1-17a1b-pan-envelope-phone-${edge}-390x844.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
