import { expect, test } from '@playwright/test';

test('offers Sunny Sprout and Bubble Berry, with Sunny selected in a fixed viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('./');
  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const sunny = seeds.getByRole('button', { name: 'Sunny Sprout' });
  const bubble = seeds.getByRole('button', { name: 'Bubble Berry' });
  const coins = page.getByRole('status', { name: 'Coins' });

  await expect(seeds).toBeVisible();
  await expect(sunny).toBeVisible();
  await expect(bubble).toBeVisible();
  await expect(seeds.getByRole('button')).toHaveCount(2);
  await expect(seeds.getByText('Twistroot')).toHaveCount(0);
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(bubble).toHaveAttribute('aria-pressed', 'false');
  await expect(coins).toHaveText('12');

  for (const seed of [sunny, bubble]) {
    const target = await seed.boundingBox();
    expect(target).not.toBeNull();
    expect(target!.width).toBeGreaterThanOrEqual(48);
    expect(target!.height).toBeGreaterThanOrEqual(48);
  }

  if (testInfo.project.name === 'mobile-portrait') await bubble.tap();
  else await bubble.click();
  await expect(bubble).toHaveAttribute('aria-pressed', 'true');
  await expect(sunny).toHaveAttribute('aria-pressed', 'false');

  await sunny.focus();
  await sunny.press('Enter');
  await expect(sunny).toHaveAttribute('aria-pressed', 'true');
  await expect(bubble).toHaveAttribute('aria-pressed', 'false');
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
