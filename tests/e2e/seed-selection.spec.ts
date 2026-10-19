import { expect, test } from '@playwright/test';
import { palette } from '../../src/render/palette';

test('offers all three seeds, with Sunny selected and Twistroot selectable in a fixed viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(testInfo.project.name === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 });
  await page.goto('./');
  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const sunny = seeds.getByRole('button', { name: 'Sunny Sprout' });
  const bubble = seeds.getByRole('button', { name: 'Bubble Berry' });
  const twistroot = seeds.getByRole('button', { name: 'Twistroot' });
  const trayLabel = seeds.getByText('Seeds', { exact: true });
  const coins = page.getByRole('status', { name: 'Coins' });

  await expect(seeds).toBeVisible();
  await expect(sunny).toBeVisible();
  await expect(bubble).toBeVisible();
  await expect(twistroot).toBeVisible();
  await expect(trayLabel).toBeVisible();
  await expect(seeds.getByRole('button')).toHaveCount(3);
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(bubble).toHaveAttribute('aria-pressed', 'false');
  await expect(coins).toHaveText('12');

  const trayBounds = await seeds.boundingBox();
  const labelBounds = await trayLabel.boundingBox();
  expect(trayBounds).not.toBeNull();
  expect(labelBounds).not.toBeNull();
  expect(labelBounds!.x).toBeGreaterThanOrEqual(trayBounds!.x);
  expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(trayBounds!.x + trayBounds!.width);
  expect(labelBounds!.y).toBeLessThanOrEqual(trayBounds!.y + 1);
  expect(labelBounds!.y + labelBounds!.height).toBeGreaterThanOrEqual(trayBounds!.y);

  for (const seed of [sunny, bubble, twistroot]) {
    const target = await seed.boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(48);
    expect(target!.height).toBeGreaterThanOrEqual(48);
  }

  if (testInfo.project.name === 'mobile-portrait') await twistroot.tap();
  else await twistroot.click();
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
  await expect(twistroot).toHaveClass(/is-selected/);
  await expect(sunny).toHaveAttribute('aria-pressed', 'false');
  await expect(bubble).toHaveAttribute('aria-pressed', 'false');

  await sunny.focus();
  await sunny.press('Enter');
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(bubble).toHaveAttribute('aria-pressed', 'false');
  await twistroot.focus();
  await twistroot.press('Enter');
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
  await expect(sunny).toHaveAttribute('aria-pressed', 'false');
  await expect(twistroot).toHaveClass(/is-selected/);
  await expect(twistroot).toBeFocused();
  const panel = palette.ui.panel;
  const accent = palette.ui.accent;
  const expectedPanelRgb = `rgb(${Number.parseInt(panel.slice(1, 3), 16)}, ${Number.parseInt(panel.slice(3, 5), 16)}, ${Number.parseInt(panel.slice(5, 7), 16)})`;
  const expectedAccentRgb = `rgb(${Number.parseInt(accent.slice(1, 3), 16)}, ${Number.parseInt(accent.slice(3, 5), 16)}, ${Number.parseInt(accent.slice(5, 7), 16)})`;
  await page.mouse.move(0, 0);
  await expect(twistroot).toHaveCSS('background-color', expectedPanelRgb);
  await expect(twistroot).toHaveCSS('color', expectedAccentRgb);
  await expect(sunny).toHaveCSS('background-color', expectedAccentRgb);
  await expect(coins).toHaveText('12');

  const pageSize = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  expect(pageSize.width).toBe(pageSize.viewportWidth);
  expect(pageSize.height).toBe(pageSize.viewportHeight);
  expect(pageSize.scrollX).toBe(0);
  expect(pageSize.scrollY).toBe(0);
  expect(pageSize.htmlOverflow).toBe('hidden');
  expect(pageSize.bodyOverflow).toBe('hidden');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
  });
  await expect(twistroot).toBeFocused();
  await expect(twistroot).toHaveClass(/is-selected/);
  await expect(twistroot).toHaveCSS('background-color', expectedPanelRgb);
  await expect(twistroot).toHaveCSS('color', expectedAccentRgb);
  const view = testInfo.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({
    path: `docs/art/evidence/m1-07e2-seed-selection-${view}.png`,
    fullPage: false,
    scale: 'css',
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});

test('seed activation emits selection events for touch or pointer and keyboard input', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-ui.html');
  const sunny = page.getByRole('navigation', { name: 'Seeds' }).getByRole('button', { name: 'Sunny Sprout' });
  const events = page.getByRole('list', { name: 'Selection events' });

  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(events.getByRole('listitem')).toHaveCount(0);
  if (testInfo.project.name === 'mobile-portrait') await sunny.tap();
  else await sunny.click();
  await expect(events.getByRole('listitem')).toHaveText(['sunny-sprout']);

  await sunny.focus();
  await sunny.press('Enter');
  await expect(events.getByRole('listitem')).toHaveText(['sunny-sprout', 'sunny-sprout']);
});

test('selected seed depresses while pressed and returns to its raised state on release', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(testInfo.project.name === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 });
  await page.goto('./');

  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const twistroot = seeds.getByRole('button', { name: 'Twistroot' });
  await twistroot.focus();
  await twistroot.press('Enter');
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect(twistroot).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -3)');

  const bounds = await twistroot.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  const restingStyle = await twistroot.evaluate((button) => {
    const style = getComputedStyle(button);
    return { transform: style.transform, boxShadow: style.boxShadow };
  });
  expect(restingStyle.transform).toBe('matrix(1, 0, 0, 1, 0, -3)');
  expect(restingStyle.boxShadow).toContain('0px 8px 0px');

  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(twistroot).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 5)');
  await expect(twistroot).toHaveCSS('box-shadow', /0px 0px 0px/);

  await page.mouse.up();
  await expect(twistroot).toHaveCSS('transform', restingStyle.transform);
  await expect(twistroot).toHaveCSS('box-shadow', restingStyle.boxShadow);
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
});
