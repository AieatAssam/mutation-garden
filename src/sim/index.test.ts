import { describe, expect, it } from 'vitest';
import { SIM_SCHEMA_VERSION } from './index';

describe('sim module', () => {
  it('loads without a renderer or DOM', () => {
    expect(SIM_SCHEMA_VERSION).toBe(0);
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });
});
