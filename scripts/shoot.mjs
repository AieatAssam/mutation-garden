// Captures the running game at phone and desktop sizes: node scripts/shoot.mjs <outDir> [url] [--plant] [--gpu]
// --gpu uses the real GPU (sharper: the software renderer is slow enough to drop the pixel ratio to 1).
// --plant plants a mix on the phone and captures at 3 s, 9 s and 26 s.
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const plantMode = args.includes('--plant');
const [out = '.', url = 'http://localhost:5173/mutation-garden/'] = args.filter((arg) => !arg.startsWith('--'));
const browser = await chromium.launch(args.includes('--gpu')
  ? { headless: false, args: ['--window-position=-2400,0'] }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, viewport, scale] of [['phone', { width: 390, height: 844 }, 2], ['desktop', { width: 1280, height: 800 }, 1]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  if (plantMode) {
    // Start from a level-3 garden so every seed is unlocked (same envelope format as src/save/codec.ts).
    const state = { schema: 4, coins: 12, lastNowMs: 0, rngState: 7, mutationRngState: 2492178918, scriptedGiantUsed: true, scriptedGoldenUsed: true, plantCount: 0, owned: [], fertiliser: 0, crate: [], sellingSince: null,
      badLuck: { giant: 0, golden: 0, glowing: 0, crystal: 0, rainbow: 0 }, discoveries: [], rewardsPaid: [], xp: 25,
      plots: Array.from({ length: 6 }, (_, index) => ({ id: `plot-${index}`, plant: null })) };
    const text = JSON.stringify(state);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
    const save = { schema: 4, savedAt: 0, appVersion: 'shoot', checksum: hash.toString(16).padStart(8, '0'), state };
    await page.addInitScript((envelope) => {
      const request = indexedDB.open('mutation-garden', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saves');
      request.onsuccess = () => request.result.transaction('saves', 'readwrite').objectStore('saves').put(envelope, 'slot-0');
    }, save);
  }
  page.on('console', (m) => m.type() === 'error' && console.error(name, m.text()));
  await page.goto(url);
  await page.locator('body[data-models="ready"]').waitFor();
  await page.waitForTimeout(500);
  if (!plantMode) {
    await page.screenshot({ path: `${out}/${name}.png` });
  } else {
    // Phone plot centres (CSS px) for the current camera; desktop skips planting.
    if (name !== 'phone') { await page.close(); continue; }
    const plots = [[157, 314], [271, 334], [124, 378], [238, 399], [91, 443], [205, 463]];
    const order = ['Twistroot', 'Bubble Berry', 'Sunny Sprout', 'Sunny Sprout', 'Sunny Sprout', 'Sunny Sprout'];
    for (const [index, [x, y]] of plots.entries()) {
      await page.getByRole('button', { name: order[index] }).click();
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
    }
    for (const [label, wait] of [['3s', 3000], ['9s', 6000], ['26s', 17000]]) {
      await page.waitForTimeout(wait);
      await page.screenshot({ path: `${out}/${name}-${label}.png` });
    }
  }
  await page.close();
}
await browser.close();
