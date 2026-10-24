import { expect, type Page } from '@playwright/test';

/**
 * Harvest payouts vary with yield size, the fresh bonus and swipe combos (design.md 4.3), so specs
 * check the counter against what the game showed: every "+N" label plus any combo bonus.
 */
export async function expectHarvestPaid(page: Page, act: () => Promise<void>): Promise<{ before: number; after: number; paid: number; payouts: number[]; labels: string[] }> {
  const coins = page.getByRole('status', { name: 'Coins' });
  const before = Number((await coins.textContent())?.trim());
  await page.evaluate(() => {
    const record = window as unknown as { __payouts?: number[]; __payoutLabels?: string[] };
    record.__payouts = [];
    record.__payoutLabels = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains('rewards__label--coins')) {
            record.__payouts!.push(Number(node.textContent!.match(/^\+(\d+)/)?.[1]));
            record.__payoutLabels!.push(node.textContent!.trim());
          }
          if (node.classList.contains('mutation-reveal__line') && /^\+\d+ coins first-find bonus$/.test(node.textContent!.trim())) {
            record.__payouts!.push(Number(node.textContent!.match(/\d+/)![0]));
          }
          for (const line of node.querySelectorAll?.('.mutation-reveal__line') ?? []) {
            if (/^\+\d+ coins first-find bonus$/.test(line.textContent!.trim())) record.__payouts!.push(Number(line.textContent!.match(/\d+/)![0]));
          }
          if (node.classList.contains('rewards__combo')) {
            const bonus = node.querySelector('span')?.textContent;
            if (bonus) record.__payouts!.push(Number(bonus.replace('+', '')));
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as unknown as { __payoutObserver?: MutationObserver }).__payoutObserver?.disconnect();
    (window as unknown as { __payoutObserver?: MutationObserver }).__payoutObserver = observer;
  });
  await act();
  const read = () => page.evaluate(() => ({
    paid: ((window as unknown as { __payouts?: number[] }).__payouts ?? []).reduce((sum, value) => sum + value, 0),
    shown: Number(document.querySelector('[aria-label="Coins"]')?.textContent?.trim()),
  }));
  // The counter rolls up over about 400 ms (motion.md 7), so wait for it to settle on the total.
  await expect.poll(async () => {
    const { paid, shown } = await read();
    return paid > 0 && shown === before + paid;
  }, { message: 'the counter moved by exactly the payout shown', timeout: 5_000 }).toBe(true);
  const { paid, shown: after } = await read();
  return {
    before, after, paid,
    payouts: await page.evaluate(() => (window as unknown as { __payouts?: number[] }).__payouts ?? []),
    labels: await page.evaluate(() => (window as unknown as { __payoutLabels?: string[] }).__payoutLabels ?? []),
  };
}
