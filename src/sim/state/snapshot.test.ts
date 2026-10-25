import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from '../index';

describe('derived mutation recipe progress', () => {
  it('counts adjacent rule plants only while candidates are still growing', () => {
    const initial = createInitialState(13, 0, { xp: 2_500 });
    const planted = step(initial, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'puffcap' },
    ], 0).state;
    expect(getSnapshot(planted).mutationProgress).toEqual([]);

    const growing = getSnapshot(step(planted, [], 4_000).state).mutationProgress;
    expect(growing).toEqual([
      { plotId: 'plot-0', giantWaters: 0, goldenNeighbours: 1, glowingNeighbours: 0 },
      { plotId: 'plot-1', giantWaters: 0, goldenNeighbours: 1, glowingNeighbours: 1 },
      { plotId: 'plot-3', giantWaters: 0, goldenNeighbours: 1, glowingNeighbours: 0 },
    ]);

    const watered = step(planted, [{ type: 'Water', plotId: 'plot-0' }], 4_000).state;
    expect(getSnapshot(watered).mutationProgress?.find(({ plotId }) => plotId === 'plot-0')?.giantWaters).toBe(1);
    const mature = getSnapshot(step(planted, [], 7_000).state);
    expect(mature.mutationProgress?.some(({ plotId }) => plotId === 'plot-0' || plotId === 'plot-1')).toBe(false);
  });
});
