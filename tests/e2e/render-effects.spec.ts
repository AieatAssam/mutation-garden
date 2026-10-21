import { expect, test } from '@playwright/test';

test('captures Growing soil puff renderer-fixture evidence', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const suffix = mobile ? 'phone-390x844' : 'desktop-1280x800';
  await page.setViewportSize(viewport);
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-render.html?stage-effects');
  await expect(page.locator('body')).toHaveAttribute('data-stage-effects', 'rendered');
  await expect(page.locator('#stage')).toBeVisible();
  await page.screenshot({
    path: `docs/art/evidence/m1-12a-renderer-fixture-growth-puff-${suffix}.png`,
    scale: 'css',
    animations: 'allow',
  });
});
