import { describe, expect, it } from 'vitest';
import { gustAt, windAt, WIND_SPEED } from './wind';

describe('wind', () => {
  it('gusts every 9 to 14 s for 1.5 s, and doubles the wave at most', () => {
    const starts: number[] = [];
    let wasGusting = false;
    for (let t = 1.7e12; t < 1.7e12 + 120_000; t += 50) {
      const gusting = gustAt(t) > 0;
      if (gusting && !wasGusting) starts.push(t);
      wasGusting = gusting;
    }
    const gaps = starts.slice(1).map((start, index) => start - starts[index]!);
    expect(gaps.length).toBeGreaterThan(7);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(8_950);
      expect(gap).toBeLessThanOrEqual(14_050);
    }
    for (let t = 0; t < 60_000; t += 37) expect(Math.abs(windAt(1.3, t))).toBeLessThanOrEqual(2);
  });

  it('travels along +x', () => {
    // A point one second downwind sees what x = 0 saw one second earlier.
    expect(windAt(WIND_SPEED, 5_000)).toBeCloseTo(windAt(0, 4_000), 10);
  });
});
