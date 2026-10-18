import { describe, expect, it } from 'vitest';
import { nextRandom } from './rng';

describe('mulberry32', () => {
  it.each([
    [0, 0.26642920868471265, 1_831_565_813],
    [1, 0.6270739405881613, 1_831_565_814],
    [0x12345678, 0.10615200875326991, 2_136_985_709],
    [0xffffffff, 0.8964226141106337, 1_831_565_812],
  ])('matches the golden vector for seed %s', (seed, value, nextState) => {
    expect(nextRandom(seed)).toEqual({ value, nextState });
  });

  it('returns a uint32 state and a value in the half-open unit interval', () => {
    for (const seed of [0, 1, 0x7fffffff, 0xffffffff]) {
      const result = nextRandom(seed);
      expect(Number.isInteger(result.nextState)).toBe(true);
      expect(result.nextState).toBeGreaterThanOrEqual(0);
      expect(result.nextState).toBeLessThan(2 ** 32);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(1);
    }
  });
});
