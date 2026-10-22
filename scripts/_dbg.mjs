import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const state = { schema: 2, coins: 12, lastNowMs: 0, rngState: 7, xp: 25,
  plots: Array.from({ length: 6 }, (_, index) => ({ id: `plot-${index}`, plant: null })) };
const text = JSON.stringify(state);
let hash = 0x811c9dc5;
for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
const save = { schema: 2, savedAt: 0, appVersion: 'shoot', checksum: hash.toString(16).padStart(8, '0'), state };
await page.addInitScript((envelope) => {
  const request = indexedDB.open('mutation-garden', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('saves');
  request.onsuccess = () => request.result.transaction('saves', 'readwrite').objectStore('saves').put(envelope, 'slot-0');
}, save);
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/mutation-garden/');
await page.locator('body[data-models="ready"]').waitFor();
const plots = [[157, 345], [271, 365], [124, 407], [238, 426]];
const order = ['Twistroot', 'Bubble Berry', 'Sunny Sprout', 'Sunny Sprout'];
for (const [index, [x, y]] of plots.entries()) {
  console.log('step', index, await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => `${b.textContent}|${b.getAttribute('aria-disabled')}|${b.offsetParent ? 'vis' : 'hid'}`).join(' / ')));
  await page.getByRole('button', { name: order[index] }).click({ timeout: 3000 }).catch((e) => console.log('ERR', e.message.split('\n')[0]));
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
}
console.log(await page.evaluate(() => [document.body.dataset.models, [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent)]));
await browser.close();
