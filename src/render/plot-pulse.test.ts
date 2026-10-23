import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from '../sim';
import { pulsePlot, REPLANT_PULSE_MS } from './plot-pulse';

describe('plot pulse', () => {
  it('points a new player at the next empty plot, and any player at a fresh replant', () => {
    const fresh = getSnapshot(createInitialState(1, 0));
    expect(pulsePlot(fresh, new Map(), 0)).toBe('plot-0');
    const planted = getSnapshot(step(createInitialState(1, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state);
    expect(pulsePlot(planted, new Map(), 0)).toBe('plot-1');

    const expert = getSnapshot(createInitialState(1, 0, { xp: 90 }));
    expect(pulsePlot(expert, new Map(), 0)).toBeNull();
    const harvested = new Map([['plot-3' as const, 1_000]]);
    expect(pulsePlot(expert, harvested, 1_000 + REPLANT_PULSE_MS - 1)).toBe('plot-3');
    expect(pulsePlot(expert, harvested, 1_000 + REPLANT_PULSE_MS)).toBeNull();
  });
});
