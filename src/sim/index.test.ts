import { describe, expect, it } from 'vitest';
import { mutationRoll, SIM_SCHEMA_VERSION } from './index';

describe('sim module', () => {
  it('loads without a renderer or DOM', () => {
    expect(SIM_SCHEMA_VERSION).toBe(3);
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });

  it('derives stable per-trait mutation rolls', () => {
    expect(mutationRoll(123, 'giant')).toBe(0.4926216476596892);
    expect(mutationRoll(123, 'giant')).not.toBe(mutationRoll(123, 'golden'));
  });
});
