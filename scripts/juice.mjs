// Records planting, watering and a swipe harvest at 390x844 and tiles the harvest frames:
// node scripts/juice.mjs <outDir> [url] [--gpu]   (needs ffmpeg on PATH; --gpu uses the real GPU in a headed window)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const [out = '.', url = 'http://localhost:5173/mutation-garden/'] = args.filter((arg) => !arg.startsWith('--'));
const browser = await chromium.launch(args.includes('--gpu')
  ? { headless: false, args: ['--window-position=-2000,0'] }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: out, size: { width: 390, height: 844 } } });
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
const t0 = Date.now();
await page.goto(url);
await page.locator('body[data-models="ready"]').waitFor();
const plots = [[91, 443], [205, 463], [124, 378], [238, 399], [157, 314], [271, 334]];
for (const [x, y] of plots.slice(0, 4)) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(2500);
await page.mouse.click(...plots[0]);
await page.waitForTimeout(6500);
const harvestAt = (Date.now() - t0) / 1000;
await page.mouse.move(...plots[0]);
await page.mouse.down();
for (const [x, y] of [plots[1], plots[3], plots[2]]) await page.mouse.move(x, y, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(1500);
const video = await page.video().path();
await context.close();
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, harvestAt - 0.1)), '-i', video, '-t', '0.9',
  '-vf', 'fps=20,crop=390:600:0:120,scale=195:-1,tile=6x3', '-frames:v', '1', `${out}/juice-tiles.png`]);
console.log(video, harvestAt);
