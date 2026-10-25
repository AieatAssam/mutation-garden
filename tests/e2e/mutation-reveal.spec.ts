import { expect, test } from '@playwright/test';
import { expectHarvestPaid } from './payout';
import { startWithSave } from './garden-save';

test('first Giant reveal swallows the skip tap and harvest pays the mutation value', async ({ page }) => {
  const plantedAt = Date.now() - 21_000;
  await startWithSave(page, 50, { scriptedGiantUsed: false, plantCount: 2, twistrootPlantedAt: plantedAt, twistrootWaterCount: 2, extraRipeSunny: true, savedAt: Date.now() });
  await page.goto('./');
  const coins = page.getByRole('status', { name: 'Coins' });
  const beforeRevealTap = await coins.textContent();
  const reveal = page.getByText('New mutation: Giant!');
  await expect(reveal).toBeVisible({ timeout: 8_000 });
  await expect(coins).toHaveText(String(Number(beforeRevealTap) + 200));
  await expect(page.getByText('+200 coins · +200 XP first-find bonus')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(reveal).toHaveCount(0);
  await expect(coins).toHaveText(String(Number(beforeRevealTap) + 200));

  await expect.poll(() => page.evaluate(() => Date.now()), { timeout: 8_000 }).toBeGreaterThanOrEqual(plantedAt + 25_000);
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  await expect.poll(() => coins.textContent(), { timeout: 3_000 }).toBe(String(Number(beforeRevealTap) + 200));
  const harvestAll = page.getByRole('button', { name: 'Harvest all 2' });
  await expect(harvestAll).toBeVisible();
  const harvest = await expectHarvestPaid(page, () => harvestAll.click());
  expect(harvest.payouts.some((payout) => payout >= 20)).toBe(true);
});
