import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __outlineThicknessUploads: number[];
  }
}

test('compiles and uploads adjacent outline thickness variants in order', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.addInitScript(() => {
    const thicknessLocations = new WeakSet<WebGLUniformLocation>();
    const uploadedThicknesses: number[] = [];
    const constructors = [window.WebGLRenderingContext, window.WebGL2RenderingContext];

    for (const Context of constructors) {
      if (!Context) continue;
      const prototype = Context.prototype as unknown as {
        getUniformLocation: (
          program: WebGLProgram,
          name: string,
        ) => WebGLUniformLocation | null;
        uniform1f: (location: WebGLUniformLocation | null, value: number) => void;
      };
      const originalGetUniformLocation = prototype.getUniformLocation;
      const originalUniform1f = prototype.uniform1f;

      prototype.getUniformLocation = function (program, name) {
        const location = originalGetUniformLocation.call(this, program, name);
        if (name === 'outlineThickness' && location) thicknessLocations.add(location);
        return location;
      };
      prototype.uniform1f = function (location, value) {
        if (location && thicknessLocations.has(location)) uploadedThicknesses.push(value);
        return originalUniform1f.call(this, location, value);
      };
    }

    Object.defineProperty(window, '__outlineThicknessUploads', { value: uploadedThicknesses });
  });

  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/outline-render.html');
  await expect(page.locator('body')).toHaveAttribute('data-render', 'complete');

  const uploadedThicknesses = await page.evaluate(() => window.__outlineThicknessUploads);
  expect(uploadedThicknesses.some((value, index) =>
    value === 0.047 && uploadedThicknesses[index + 1] === 0.035 && uploadedThicknesses[index + 2] === 0.06,
  )).toBe(true);
  expect(browserErrors).toEqual([]);
});
