import { expect, test } from '@playwright/test';
import { SHOP_PRICES, xpForLevel } from '../../src/sim';
import { startWithSave } from './garden-save';

test('buys the sprinkler and bee hive tiers while later automation stays locked', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-portrait';
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await startWithSave(page, xpForLevel(9), { coins: 2_000 });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const openShop = page.getByRole('button', { name: 'Shop' });
  if (mobile) await openShop.tap(); else await openShop.click();
  const sprinkler = page.locator('.garden-ui__shop-row').filter({ has: page.getByText('Sprinkler', { exact: true }) });
  const sprinklerTwo = page.locator('.garden-ui__shop-row').filter({ has: page.getByText('Sprinkler II', { exact: true }) });
  const hive = page.locator('.garden-ui__shop-row').filter({ has: page.getByText('Bee hive', { exact: true }) });
  const cart = page.locator('.garden-ui__shop-row').filter({ has: page.getByText('Delivery cart', { exact: true }) });
  await expect(sprinkler).toContainText(`Level 5 · ${SHOP_PRICES.sprinkler} coins`);
  await expect(sprinklerTwo.getByRole('button')).toHaveText('Requires Sprinkler');
  await expect(cart.getByRole('button')).toHaveText('Level 12');
  const buySprinkler = sprinkler.getByRole('button', { name: `Buy · ${SHOP_PRICES.sprinkler}` });
  if (mobile) await buySprinkler.tap(); else await buySprinkler.click();
  await expect(sprinkler.getByRole('button')).toHaveText('Owned');
  const buySprinklerTwo = sprinklerTwo.getByRole('button', { name: `Buy · ${SHOP_PRICES['sprinkler-2']}` });
  if (mobile) await buySprinklerTwo.tap(); else await buySprinklerTwo.click();
  await expect(sprinklerTwo.getByRole('button')).toHaveText('Owned');
  await expect(hive).toBeVisible();
});
