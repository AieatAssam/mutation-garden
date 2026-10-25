import { expect, test } from '@playwright/test';
import { xpForLevel } from '../../src/sim';
import { startWithSave } from './garden-save';

test('offline growth and queued sales are summarized and saved once', async ({ page }, info) => {
  const savedAt = Date.now() - 31_000;
  await startWithSave(page, xpForLevel(3), { savedAt, sellingSince: 0, crateCount: 2, twistrootPlantedAt: savedAt });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');

  const summary = page.getByRole('status', { name: 'While you were away' });
  await expect(summary).toContainText('Plants grown: 1');
  await expect(summary).toContainText('Fruit harvested: 0 · Coins sold: 2');
  await expect(summary).toContainText('Crate: empty');
  const summaryLayout = await summary.evaluate((element) => {
    const bounds = (target: Element) => target.getBoundingClientRect();
    return {
      copy: bounds(element.querySelector('p')!),
      button: bounds(element.querySelector('button')!),
      close: bounds(element.querySelector('[aria-label="Close return summary"]')!),
      panel: bounds(element),
      tray: bounds(document.querySelector('.garden-ui__tray')!),
      tools: bounds(document.querySelector('.garden-ui__tray-tools')!),
    };
  });
  const copyOverlapsButton = summaryLayout.copy.left < summaryLayout.button.right
    && summaryLayout.button.left < summaryLayout.copy.right
    && summaryLayout.copy.top < summaryLayout.button.bottom
    && summaryLayout.button.top < summaryLayout.copy.bottom;
  expect(copyOverlapsButton).toBe(false);
  expect(summaryLayout.panel.bottom).toBeLessThan(summaryLayout.tray.top);
  expect(summaryLayout.panel.bottom).toBeLessThan(summaryLayout.tools.top);
  expect(summaryLayout.close.width).toBeGreaterThanOrEqual(48);
  expect(summaryLayout.close.height).toBeGreaterThanOrEqual(48);
  if (info.project.name === 'desktop') expect(summaryLayout.panel.width).toBeLessThanOrEqual(560);
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('14');
  await expect(page.getByRole('status', { name: 'Crate' })).toHaveText('0/12');
  await page.screenshot({
    path: `test-results/evidence/m3-s4-return-summary-${info.project.name === 'desktop' ? 'desktop-1280x800' : 'phone-390x844'}.png`,
    scale: 'css',
  });

  await page.getByRole('button', { name: 'Close return summary' }).click();
  await expect(summary).toBeHidden();

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText('14');
  await expect(page.getByRole('status', { name: 'Crate' })).toHaveText('0/12');
  await expect(summary).toBeHidden();
});

test('returning to an open tab shows the away summary', async ({ page }) => {
  const savedAt = Date.now() - 3 * 60 * 60 * 1_000;
  await startWithSave(page, xpForLevel(3), {
    savedAt,
    twistrootPlantedAt: savedAt,
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const summary = page.getByRole('status', { name: 'While you were away' });
  await expect(summary).toContainText('Plants grown: 1');
  await page.getByRole('button', { name: 'Close return summary' }).click();
  await expect(summary).toBeHidden();

  await page.evaluate(() => {
    const state = window as unknown as { __gardenHidden: boolean; __gardenNow: number };
    const now = Date.now();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state.__gardenHidden });
    state.__gardenHidden = true;
    state.__gardenNow = now;
    Date.now = () => state.__gardenNow;
    document.dispatchEvent(new Event('visibilitychange'));
    state.__gardenNow += 10_000;
    state.__gardenHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(summary).toBeHidden();
  await page.evaluate(() => {
    const state = window as unknown as { __gardenHidden: boolean; __gardenNow: number };
    state.__gardenHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    state.__gardenNow += 31_000;
    state.__gardenHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(summary).toContainText('Plants grown: 0');
});
