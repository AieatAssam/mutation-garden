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
      tools: rect(trayElement.querySelector('.garden-ui__tray-tools')!),
      labelFontSize: Number.parseFloat(getComputedStyle(trayElement.querySelector('.garden-ui__tray-label')!).fontSize),
      cue: {
        ...rect(trayElement.querySelector('.garden-ui__scroll-cue')!),
        visibility: getComputedStyle(trayElement.querySelector('.garden-ui__scroll-cue')!).visibility,
        ariaHidden: trayElement.querySelector('.garden-ui__scroll-cue')!.getAttribute('aria-hidden'),
      },
      seeds: {
        ...rect(trayElement.querySelector('.garden-ui__seeds')!),
        scrollWidth: (trayElement.querySelector('.garden-ui__seeds') as HTMLElement).scrollWidth,
        clientWidth: (trayElement.querySelector('.garden-ui__seeds') as HTMLElement).clientWidth,
      },
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
  const cueToolsDisjoint = layout.cue.right <= layout.tools.left || layout.tools.right <= layout.cue.left || layout.cue.bottom <= layout.tools.top || layout.tools.bottom <= layout.cue.top;
  expect(cueToolsDisjoint).toBe(true);
  expect(layout.cue.left).toBeGreaterThanOrEqual(layout.seeds.right);
  expect(layout.cue.ariaHidden).toBe('true');
  expect(layout.cue.visibility).toBe(layout.seeds.scrollWidth > layout.seeds.clientWidth ? 'visible' : 'hidden');
  expect(layout.labelFontSize).toBeGreaterThanOrEqual(13);
  expect(layout.seeds.scrollWidth).toBeGreaterThan(layout.seeds.clientWidth);

  if (testInfo.project.name === 'mobile-portrait') {
    await expect(tray.locator('.garden-ui__tray-label')).toBeHidden();
    await page.locator('.garden-ui__coin-amount').evaluate((element) => { element.textContent = '1200'; });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const topHud = await page.evaluate(() => {
        const bounds = (element: Element) => {
          const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
          return { left, top, right, bottom, width, height };
        };
        const hint = document.querySelector('.garden-ui__hint');
        const toggles = [...document.querySelectorAll('.garden-ui__toggles .garden-ui__toggle')];
        const boxes = [
          document.querySelector('.garden-ui__coins')!,
          document.querySelector('.garden-ui__card')!,
          document.querySelector('.garden-ui__crate-amount')!,
          ...toggles,
          ...(hint && hint.getBoundingClientRect().width ? [hint] : []),
        ].map(bounds);
        return { boxes, toggles: toggles.map(bounds) };
      });
      for (const toggle of topHud.toggles) {
        expect(toggle.width, `HUD toggle at ${width}px has 48px width`).toBeGreaterThanOrEqual(48);
        expect(toggle.height, `HUD toggle at ${width}px has 48px height`).toBeGreaterThanOrEqual(48);
      }
      for (let first = 0; first < topHud.boxes.length; first += 1) {
        for (let second = first + 1; second < topHud.boxes.length; second += 1) {
          const a = topHud.boxes[first]!;
          const b = topHud.boxes[second]!;
          expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
            `top HUD controls do not overlap at ${width}px: ${JSON.stringify({ first: a, second: b })}`).toBe(true);
        }
      }
    }
    await page.setViewportSize(viewport);
  }

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

  // Start in the tray, then exercise its complete keyboard sequence with real Tab presses.
  await seeds[0]!.focus();
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

  const seedStripFits = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.garden-ui__seeds')!;
    [...strip.querySelectorAll<HTMLElement>('.garden-ui__seed')].slice(1).forEach(seed => { seed.style.display = 'none'; });
    window.dispatchEvent(new Event('resize'));
    return strip.scrollWidth <= strip.clientWidth;
  });
  expect(seedStripFits).toBe(true);
  await expect(tray.locator('.garden-ui__scroll-cue')).toHaveCSS('visibility', 'hidden');
  const seedStripOverflows = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.garden-ui__seeds')!;
    [...strip.querySelectorAll<HTMLElement>('.garden-ui__seed')].forEach(seed => { seed.style.display = ''; });
    window.dispatchEvent(new Event('resize'));
    return strip.scrollWidth > strip.clientWidth;
  });
  expect(seedStripOverflows).toBe(true);
  await expect(tray.locator('.garden-ui__scroll-cue')).toHaveCSS('visibility', 'visible');

  await page.locator('.garden-ui__seeds').evaluate((element: HTMLElement) => { element.scrollLeft = 0; });
  await expect(page.locator('.garden-ui__seeds')).toHaveJSProperty('scrollLeft', 0);
  const swipeStart = await page.locator('.garden-ui__seeds').evaluate(element => {
    const first = element.querySelector('.garden-ui__seed')!.getBoundingClientRect();
    const second = element.querySelectorAll('.garden-ui__seed')[1]!.getBoundingClientRect();
    const strip = element.getBoundingClientRect();
    return { x: (first.right + second.left) / 2, y: (strip.top + strip.bottom) / 2 };
  });
  const scrollBeforeSwipe = await page.locator('.garden-ui__seeds').evaluate(element => element.scrollLeft);
  const touch = await page.context().newCDPSession(page);
  try {
    const { x, y } = swipeStart;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
    for (const delta of [36, 72, 108]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - delta, y }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await touch.detach();
  }
  await expect.poll(() => page.locator('.garden-ui__seeds').evaluate(element => element.scrollLeft)).toBeGreaterThan(scrollBeforeSwipe);

  if (testInfo.project.name === 'mobile-portrait') {
    await expect(page.locator('.garden-ui')).toHaveCSS('touch-action', 'pan-x pan-y');
    await page.getByRole('button', { name: 'Shop' }).click();
    await expect(page.locator('.garden-ui__shop-backdrop')).toBeVisible();
    const scale = await page.evaluate(() => visualViewport?.scale);
    const pinch = await page.context().newCDPSession(page);
    try {
      await pinch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: 130, y: 150 }, { id: 2, x: 260, y: 150 }],
      });
      for (const delta of [10, 20, 30, 40, 50, 60]) {
        await pinch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ id: 1, x: 130 - delta, y: 150 }, { id: 2, x: 260 + delta, y: 150 }],
        });
      }
      await pinch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await pinch.detach();
    }
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(scale);
  }
});
