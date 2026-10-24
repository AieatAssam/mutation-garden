import { describe, expect, it } from 'vitest';
import { mutationRoll, SIM_SCHEMA_VERSION, LEVEL_XP } from './index';

describe('sim module', () => {
  it('loads without a renderer or DOM', () => {
    expect(SIM_SCHEMA_VERSION).toBe(4);
    expect(LEVEL_XP).toEqual([500, 900, 2_500, 3_500, 4_900, 6_500, 8_300, 10_300]);
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });

  it('derives stable per-trait mutation rolls', () => {
    expect(mutationRoll(123, 'giant')).toBe(0.4926216476596892);
    expect(mutationRoll(123, 'giant')).not.toBe(mutationRoll(123, 'golden'));
  });
});
