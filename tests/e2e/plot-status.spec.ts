import { expect, test } from '@playwright/test';

type Rgb = readonly [number, number, number];

function blend(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map((channel, index) => Math.round(channel * alpha + background[index]! * (1 - alpha))) as unknown as Rgb;
}

function maxChannelError(actual: Rgb, expected: Rgb): number {
  return Math.max(...actual.map((channel, index) => Math.abs(channel - expected[index]!)));
}

test('renders six occupied plot status descriptors in five draw calls', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  if (testInfo.project.name === 'mobile-portrait') await page.setViewportSize({ width: 390, height: 844 });
  const fixturePort = process.env.PLOT_STATUS_FIXTURE_PORT ?? '42741';
  const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
  await page.goto(new URL('/mutation-garden/tests/e2e/fixtures/plot-status.html', fixtureOrigin).toString());
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');
  await expect(page.locator('body')).toHaveAttribute('data-status-delta', '5');
  await expect(page.locator('body')).toHaveAttribute('data-status-budget', '5');
  await expect(page.locator('body')).toHaveAttribute('data-partial-stamp-opacity', '0.4');
  const samples = await page.locator('body').evaluate((body) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage');
    if (!canvas) throw new Error('Plot status canvas is missing');
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 context is missing');
    const fixtureWindow = window as unknown as Window & { setPlotStatusStampState: (opacity: number, faceVisible: boolean) => void };
    const read = (coordinate: string): readonly [number, number, number] => {
      const [cssX, cssY] = coordinate.split(',').map(Number);
      const bounds = canvas.getBoundingClientRect();
      const x = Math.round((cssX! - bounds.left) * canvas.width / bounds.width);
      const y = canvas.height - 1 - Math.round((cssY! - bounds.top) * canvas.height / bounds.height);
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [pixel[0]!, pixel[1]!, pixel[2]!];
    };
    const point = (value: string | undefined): string => {
      if (!value) throw new Error('Plot status sample coordinate is missing');
      return value;
    };
    const fruitPoint = point(body.dataset.partialStampSample);
    const paperPoint = point(body.dataset.partialPaperSample);
    const render = (opacity: number, faceVisible: boolean) => {
      fixtureWindow.setPlotStatusStampState(opacity, faceVisible);
      return { fruit: read(fruitPoint), paper: read(paperPoint) };
    };
    return {
      background: render(0, false),
      shadow: render(0.4, false),
      partial: render(0.4, true),
      full: render(1, true),
    };
  });
  const alpha = 0.4;
  let decisiveRegions = 0;
  for (const region of ['fruit', 'paper'] as const) {
    const expected = blend(samples.full[region], samples.shadow[region], alpha);
    const singleCoverageError = maxChannelError(samples.partial[region], expected);
    expect(singleCoverageError, `${region} face should apply stamp alpha once over its shadow`).toBeLessThanOrEqual(8);
    const compounded = blend(samples.full[region], expected, alpha);
    // Double-applied alpha is only distinguishable where the face and its shadow differ enough;
    // the soft tan card shadow sits close to the paper face, so that region may not decide it.
    if (maxChannelError(compounded, expected) > 16) {
      decisiveRegions += 1;
      expect(maxChannelError(samples.partial[region], compounded), `${region} face should not accumulate alpha across layers`).toBeGreaterThan(singleCoverageError + 8);
    }
    expect(maxChannelError(samples.shadow[region], samples.background[region])).toBeGreaterThan(8);
  }
  expect(decisiveRegions, 'at least one region must decide whether alpha compounds').toBeGreaterThanOrEqual(1);
  const stampCssSize = Number(await page.locator('body').getAttribute('data-stamp-css-size'));
  expect(stampCssSize).toBeGreaterThanOrEqual(26);
  expect(stampCssSize).toBeLessThanOrEqual(30);
  expect(errors).toEqual([]);
});
