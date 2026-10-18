// Renders prototype screenshots with headless Chromium (SwiftShader WebGL).
// Usage: node docs/art/prototype/render.mjs   (needs playwright resolvable via NODE_PATH)
import { chromium } from '@playwright/test';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shots = [
  ['proto-phone-day.png', '', { width: 390, height: 844 }],
  ['proto-phone-dusk.png', 'dusk', { width: 390, height: 844 }],
  ['proto-desktop-day.png', 'desktop', { width: 1280, height: 800 }],
];
for (const [file, qs, vp] of shots) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/prototype/index.html?${qs}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(root, 'prototype', 'shots', file) });
  console.log('wrote', file); await page.close();
}
await browser.close(); srv.close();
