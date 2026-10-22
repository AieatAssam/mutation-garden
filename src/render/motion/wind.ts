/**
 * Shared wind (m1-liveliness.md 4.1): a 3.2 s sine travelling along +x at 1.2 units/s, plus a gust
 * every 9 to 14 s that doubles the amplitude for 1.5 s as it passes across the island.
 * Pure function of presentation time, so the plant lean and the grass shader agree.
 */
export const WIND_PERIOD_MS = 3200;
export const WIND_SPEED = 1.2;
const GUST_MS = 1500;
const GUST_CELL_MS = 11_500;
const GUST_JITTER_MS = 1250;

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Gust strength 0..1 at time `timeMs`; rises and falls smoothly over 1.5 s. Gust k starts at
 * k × 11.5 s ± 1.25 s, so gaps fall between 9 and 14 s and lookup is O(1) for any clock.
 */
export function gustAt(timeMs: number): number {
  const cell = Math.floor(timeMs / GUST_CELL_MS);
  for (let k = cell - 1; k <= cell; k += 1) {
    const t = (timeMs - (k * GUST_CELL_MS + (hash(k) - 0.5) * 2 * GUST_JITTER_MS)) / GUST_MS;
    if (t >= 0 && t < 1) return Math.sin(t * Math.PI) ** 2;
  }
  return 0;
}

/** Wind at world x, -1..2: the travelling sine scaled up to double by a gust that sweeps left to right. */
export function windAt(x: number, timeMs: number): number {
  const phase = (timeMs / 1000 - x / WIND_SPEED) / (WIND_PERIOD_MS / 1000);
  return Math.sin(phase * Math.PI * 2) * (1 + gustAt(timeMs - (x / WIND_SPEED) * 1000));
}
