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
  const coins = page.getByRole('status', { name: 'Coins' });

  await expect(seeds).toBeVisible();
  await expect(sunny).toBeVisible();
  await expect(bubble).toBeVisible();
  await expect(twistroot).toBeVisible();
  await expect(seeds.getByRole('button')).toHaveCount(3);
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(bubble).toHaveAttribute('aria-pressed', 'false');
  await expect(coins).toHaveText('12');

  for (const seed of [sunny, bubble, twistroot]) {
    const target = await seed.boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(48);
    expect(target!.height).toBeGreaterThanOrEqual(48);
  }

  if (testInfo.project.name === 'mobile-portrait') await twistroot.tap();
  else await twistroot.click();
  await expect(twistroot).toHaveAttribute('aria-pressed', 'true');
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
  const accentPressed = palette.ui['accent-pressed'];
  const expectedPressedRgb = `rgb(${Number.parseInt(accentPressed.slice(1, 3), 16)}, ${Number.parseInt(accentPressed.slice(3, 5), 16)}, ${Number.parseInt(accentPressed.slice(5, 7), 16)})`;
  await expect(twistroot).toHaveCSS('background-color', expectedPressedRgb);
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
  // Move off the previously tapped seed to clear hover while retaining keyboard focus.
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
  });
  await expect(twistroot).toBeFocused();
  await expect(twistroot).toHaveClass(/is-selected/);
  await expect(twistroot).toHaveCSS('background-color', expectedPressedRgb);
  const view = testInfo.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844';
  await page.screenshot({ path: `docs/art/evidence/m1-08c2-twistroot-seed-${view}.png`, scale: 'css' });
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
