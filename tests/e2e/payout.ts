import { expect, type Page } from '@playwright/test';

/**
 * Harvest payouts vary with yield size, the fresh bonus and swipe combos (design.md 4.3), so specs
 * check the counter against what the game showed: every "+N" label plus any combo bonus.
 */
export async function expectHarvestPaid(page: Page, act: () => Promise<void>): Promise<{ before: number; after: number; paid: number }> {
  const coins = page.getByRole('status', { name: 'Coins' });
  const before = Number((await coins.textContent())?.trim());
  await page.evaluate(() => {
    const record = window as unknown as { __payouts?: number[] };
    record.__payouts = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains('rewards__label--coins')) record.__payouts!.push(Number(node.textContent!.replace('+', '')));
          if (node.classList.contains('rewards__combo')) {
            const bonus = node.querySelector('span')?.textContent;
            if (bonus) record.__payouts!.push(Number(bonus.replace('+', '')));
          }
        }
      }
    });
    observer.observe(document.querySelector('.rewards')!, { childList: true });
    (window as unknown as { __payoutObserver?: MutationObserver }).__payoutObserver?.disconnect();
    (window as unknown as { __payoutObserver?: MutationObserver }).__payoutObserver = observer;
  });
  await act();
  await expect.poll(async () => Number((await coins.textContent())?.trim()), { timeout: 5_000 }).toBeGreaterThan(before);
  // Labels and the counter update in the same sim tick; give the observer one frame to record them.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const paid = await page.evaluate(() => ((window as unknown as { __payouts?: number[] }).__payouts ?? []).reduce((sum, value) => sum + value, 0));
  const after = Number((await coins.textContent())?.trim());
  expect(paid, 'the game showed a payout').toBeGreaterThan(0);
  expect(after, 'the counter moved by exactly the payout shown').toBe(before + paid);
  return { before, after, paid };
}
