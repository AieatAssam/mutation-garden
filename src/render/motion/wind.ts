/**
 * Shared wind (m1-liveliness.md 4.1): a 3.2 s sine travelling along +x at 1.2 units/s, plus a gust
 * every 9 to 14 s that doubles the amplitude for 1.5 s as it passes across the island.
 * Pure function of presentation time, so the plant lean and the grass shader agree.
 */
export const WIND_PERIOD_MS = 3200;
export const WIND_SPEED = 1.2;
const GUST_MS = 1500;

/** Start of gust `index` in ms; gaps are 9 to 14 s from a fixed hash, so they look irregular. */
function gustStart(index: number): number {
  let start = 0;
  for (let i = 0; i < index; i += 1) start += 9000 + 5000 * hash(i);
  return start;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Gust strength 0..1 at time `timeMs`; rises and falls smoothly over 1.5 s. */
export function gustAt(timeMs: number): number {
  if (timeMs < 0) return 0;
  // ponytail: linear walk from 0; fine for sessions of hours (a few hundred gusts).
  let index = Math.floor(timeMs / 11_500);
  while (index > 0 && gustStart(index) > timeMs) index -= 1;
  while (gustStart(index + 1) <= timeMs) index += 1;
  const t = (timeMs - gustStart(index)) / GUST_MS;
  return t >= 0 && t < 1 ? Math.sin(t * Math.PI) ** 2 : 0;
}

/** Wind at world x, -1..2: the travelling sine scaled up to double by a gust that sweeps left to right. */
export function windAt(x: number, timeMs: number): number {
  const phase = (timeMs / 1000 - x / WIND_SPEED) / (WIND_PERIOD_MS / 1000);
  return Math.sin(phase * Math.PI * 2) * (1 + gustAt(timeMs - (x / WIND_SPEED) * 1000));
}
