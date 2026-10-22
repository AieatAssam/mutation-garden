import { expect, test } from '@playwright/test';
import { palette } from '../../src/render/palette';
import { startWithSave } from './garden-save';

// These specs use seeds that unlock at levels 2 and 3, so they start from a level-3 save.
test.beforeEach(async ({ page }) => startWithSave(page));

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
  // Seed cards after the look prototype: the selected card is butter yellow, the others paper.
  const rgb = (hex: string) => `rgb(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(hex.slice(3, 5), 16)}, ${Number.parseInt(hex.slice(5, 7), 16)})`;
  await page.mouse.move(0, 0);
  await expect(twistroot).toHaveCSS('background-color', rgb(palette.ui.coin.emboss));
  await expect(twistroot).toHaveCSS('border-color', rgb(palette.ui.coin.rim));
  await expect(sunny).toHaveCSS('background-color', rgb(palette.ui.panel));
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
  await expect(twistroot).toHaveCSS('background-color', rgb(palette.ui.coin.emboss));
  const view = testInfo.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({
    path: `test-results/evidence/m1-07e2-seed-selection-${view}.png`,
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
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');

  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const twistroot = seeds.getByRole('button', { name: 'Twistroot' });
  await twistroot.focus();
  await twistroot.press('Enter');
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect(twistroot).toHaveCSS('background-color', `rgb(${[1, 3, 5].map((i) => Number.parseInt(palette.ui.coin.emboss.slice(i, i + 2), 16)).join(', ')})`);

  const bounds = await twistroot.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  const restingStyle = await twistroot.evaluate((button) => {
    const style = getComputedStyle(button);
    return { transform: style.transform, boxShadow: style.boxShadow };
  });
  expect(restingStyle.transform).toBe('none');

  // Pressing a seed card pushes it down and in slightly, like a stamp, then it springs back.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(twistroot).toHaveCSS('transform', 'matrix(0.97, 0, 0, 0.97, 0, 3)');

  await page.mouse.up();
  await expect(twistroot).toHaveCSS('transform', restingStyle.transform);
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
});
