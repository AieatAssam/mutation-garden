// Captures the running game at phone and desktop sizes: node scripts/shoot.mjs <outDir> [url] [--plant]
// --plant plants a mix on the phone and captures at 3 s, 9 s and 26 s.
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const plantMode = args.includes('--plant');
const [out = '.', url = 'http://localhost:5173/mutation-garden/'] = args.filter((arg) => !arg.startsWith('--'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, viewport, scale] of [['phone', { width: 390, height: 844 }, 2], ['desktop', { width: 1280, height: 800 }, 1]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on('console', (m) => m.type() === 'error' && console.error(name, m.text()));
  await page.goto(url);
  await page.waitForTimeout(2500);
  if (!plantMode) {
    await page.screenshot({ path: `${out}/${name}.png` });
  } else {
    // Phone plot centres (CSS px) for the current camera; desktop skips planting.
    if (name !== 'phone') { await page.close(); continue; }
    const plots = [[157, 286], [271, 309], [124, 357], [238, 380], [91, 428], [205, 451]];
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
