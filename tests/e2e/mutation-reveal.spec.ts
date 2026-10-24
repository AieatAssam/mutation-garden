import { expect, test } from '@playwright/test';
import { expectHarvestPaid } from './payout';
import { startWithSave } from './garden-save';

test('first Giant reveal swallows the skip tap and harvest pays the mutation value', async ({ page }) => {
  const plantedAt = 1_700_000_000_000;
  await page.clock.install({ time: plantedAt + 25_000 });
  await startWithSave(page, 50, { scriptedGiantUsed: false, plantCount: 2, twistrootPlantedAt: plantedAt, twistrootWaterCount: 2, extraRipeSunny: true, savedAt: plantedAt + 25_000 });
  await page.goto('./');
  const coins = page.getByRole('status', { name: 'Coins' });
  // Model load and shader warm-up run on CI's software renderer under an installed clock: allow for it.
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready', { timeout: 20_000 });
  await expect(coins).toHaveText('212');
  const reveal = page.getByText('New mutation: Giant!');
  await page.clock.runFor(2_000);
  await expect(reveal).toBeVisible();
  await expect(coins).toHaveText('212');
  await page.mouse.click(10, 10);
  await expect(reveal).toHaveCount(0);
  await expect(coins).toHaveText('212');

  await page.clock.runFor(4_000);
  // Model load and shader warm-up run on CI's software renderer under an installed clock: allow for it.
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready', { timeout: 20_000 });
  await expect(coins).toHaveText('212');
  const harvestAll = page.getByRole('button', { name: 'Harvest all 2' });
  await expect(harvestAll).toBeVisible();
  const harvest = await expectHarvestPaid(page, () => harvestAll.click());
  expect(harvest.payouts.some((payout) => payout >= 20)).toBe(true);
});
