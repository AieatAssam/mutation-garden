import { expect, test } from '@playwright/test';
import { startWithSave } from './garden-save';

// These specs use seeds that unlock at levels 2 and 3, so they start from a level-3 save.
test.beforeEach(async ({ page }) => startWithSave(page));

test('all seed controls and their focus rings fit the viewport safe areas', async ({ page }, testInfo) => {
  const viewport = testInfo.project.name === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto('http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/garden-ui.html');
  await page.setViewportSize(viewport);
  await page.evaluate(async () => { await document.fonts.ready; });

  const tray = page.getByRole('navigation', { name: 'Seeds' });
  const seedNames = ['Sunny Sprout', 'Bubble Berry', 'Twistroot', 'Puffcap', 'Lantern Pod', 'Comet Pear', 'Clockvine', 'Dewbell'];
  const seeds = seedNames.map((name) => tray.getByRole('button', { name }));
  await expect(tray).toBeVisible();
  await expect(tray.locator('.garden-ui__seed')).toHaveCount(seedNames.length);

  const layout = await page.evaluate(() => {
    const trayElement = document.querySelector<HTMLElement>('.garden-ui__tray');
    if (!trayElement) throw new Error('Seed tray fixture is missing its layout element.');
    const trayStyle = getComputedStyle(trayElement);
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      safe: {
        left: Number.parseFloat(trayStyle.left),
        right: Number.parseFloat(trayStyle.right),
        bottom: Number.parseFloat(trayStyle.bottom),
      },
      label: rect(trayElement.querySelector('.garden-ui__tray-label')!),
      seeds: rect(trayElement.querySelector('.garden-ui__seeds')!),
      buttons: [...trayElement.querySelectorAll<HTMLElement>('.garden-ui__seed')].map((button) => ({
        ...rect(button),
        text: button.querySelector('.garden-ui__seed-name')?.textContent?.trim(),
        textWidth: button.scrollWidth,
        clientWidth: button.clientWidth,
      })),
      clippingAncestors: [...trayElement.querySelectorAll<HTMLElement>('.garden-ui__seed')].map((button) => {
        const clipped: string[] = [];
        let ancestor: HTMLElement | null = button;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          if (['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY)) {
            clipped.push(ancestor.className || ancestor.tagName);
          }
          ancestor = ancestor.parentElement;
        }
        return clipped;
      }),
    };
  });

  expect(layout.viewport).toEqual(viewport);
  expect(layout.label.left).toBeGreaterThanOrEqual(0);
  expect(layout.label.right).toBeLessThanOrEqual(viewport.width);
  expect(layout.label.top).toBeGreaterThanOrEqual(0);
  expect(layout.label.bottom).toBeLessThanOrEqual(viewport.height);
  expect(layout.buttons.map(button => button.text)).toEqual(seedNames);
  for (const [index, button] of layout.buttons.entries()) {
    expect(button.width, `seed ${button.text} width`).toBeGreaterThanOrEqual(48);
    expect(button.height, `seed ${button.text} height`).toBeGreaterThanOrEqual(48);
    expect(button.textWidth, `seed ${button.text} label fits`).toBeLessThanOrEqual(button.clientWidth);
    expect(layout.clippingAncestors[index], `seed ${button.text} has no clipping ancestor`).toEqual([]);
    await expect(seeds[index]!).toBeVisible();
  }
  for (let first = 0; first < layout.buttons.length; first += 1) {
    for (let second = first + 1; second < layout.buttons.length; second += 1) {
      const a = layout.buttons[first]!;
      const b = layout.buttons[second]!;
      const disjoint = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(disjoint, `${a.text} and ${b.text} do not overlap`).toBe(true);
    }
  }

  const inspectFocusRing = (button: typeof seeds[number]) => button.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const expansion = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      offset: Number.parseFloat(style.outlineOffset),
      left: bounds.left - expansion,
      top: bounds.top - expansion,
      right: bounds.right + expansion,
      bottom: bounds.bottom + expansion,
    };
  });

  // Tab is real keyboard navigation. Sound and music come before the seeds; Shop follows them.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  for (const [index, seed] of seeds.entries()) {
    await expect(seed).toBeFocused();
    const focus = await inspectFocusRing(seed);
    expect(focus.style, `seed ${index} focus ring is visible`).toBe('solid');
    expect(focus.width, `seed ${index} focus ring width`).toBeGreaterThan(0);
    expect(focus.offset, `seed ${index} focus ring offset`).toBeGreaterThanOrEqual(0);
    expect(focus.left, `seed ${index} focus ring left safe area`).toBeGreaterThanOrEqual(layout.safe.left);
    expect(focus.top, `seed ${index} focus ring top viewport`).toBeGreaterThanOrEqual(0);
    expect(focus.right, `seed ${index} focus ring right safe area`).toBeLessThanOrEqual(viewport.width - layout.safe.right);
    expect(focus.bottom, `seed ${index} focus ring bottom safe area`).toBeLessThanOrEqual(viewport.height - layout.safe.bottom);
    expect(focus.left, `seed ${index} focus ring stays in the scroll viewport`).toBeGreaterThan(layout.seeds.left);
    expect(focus.right, `seed ${index} focus ring stays in the scroll viewport`).toBeLessThan(layout.seeds.right);
    expect(focus.top, `seed ${index} focus ring stays in the scroll viewport`).toBeGreaterThan(layout.seeds.top);
    expect(focus.bottom, `seed ${index} focus ring stays in the scroll viewport`).toBeLessThan(layout.seeds.bottom);
    if (index === 0) {
      expect(focus.left, 'first seed focus ring has 12px left clearance').toBeGreaterThanOrEqual(12);
      expect(focus.right, 'first seed focus ring has 12px right clearance').toBeLessThanOrEqual(viewport.width - 12);
      expect(focus.bottom, 'first seed focus ring has 12px bottom clearance').toBeLessThanOrEqual(viewport.height - 12);
    }
    if (index < seeds.length - 1) await page.keyboard.press('Tab');
  }

  // Restore focus to the first seed so evidence shows the edge clearance being checked above.
  for (let index = 1; index < seeds.length; index += 1) await page.keyboard.press('Shift+Tab');
  await expect(seeds[0]!).toBeFocused();

  await page.screenshot({
    path: testInfo.project.name === 'desktop'
      ? 'test-results/evidence/m1-08c2-seed-tray-desktop-1280x800.png'
      : 'test-results/evidence/m1-08c2-seed-tray-phone-390x844.png',
    scale: 'css',
  });

  if (testInfo.project.name === 'mobile-portrait') await seeds[1]!.tap();
  else await seeds[1]!.click();
  await expect(page.getByRole('list', { name: 'Selection events' }).getByRole('listitem')).toHaveText(['bubble-berry']);
});
