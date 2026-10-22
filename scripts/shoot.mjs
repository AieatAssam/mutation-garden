// Captures the running game at phone and desktop sizes: node scripts/shoot.mjs <outDir> [url]
import { chromium } from '@playwright/test';
const [out = '.', url = 'http://localhost:5173/mutation-garden/'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, viewport, scale] of [['phone', { width: 390, height: 844 }, 2], ['desktop', { width: 1280, height: 800 }, 1]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on('console', (m) => m.type() === 'error' && console.error(name, m.text()));
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
}
await browser.close();
