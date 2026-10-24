import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from '../sim';
import { hintFor } from './hints';

describe('first-minute hints', () => {
  it('walks a new player through plant, wait, harvest and the next unlock', () => {
    const fresh = createInitialState(1, 0);
    expect(hintFor(getSnapshot(fresh), 'sunny-sprout')).toBe('Tap a plot to plant.');
    const planted = step(fresh, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    expect(hintFor(getSnapshot(planted), 'sunny-sprout')).toBe('Tap a growing plant to water it.');
    const ripe = step(planted, [], 8_000).state;
    expect(hintFor(getSnapshot(ripe), 'sunny-sprout')).toBe('Tap the ripe plant to harvest.');
    const two = step(step(ripe, [{ type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' }], 8_000).state, [], 16_000).state;
    expect(hintFor(getSnapshot(two), 'sunny-sprout')).toBe('Swipe across ripe plants to harvest.');
    const harvested = step(two, [{ type: 'Harvest', plotIds: ['plot-0', 'plot-1'] }], 16_000).state;
    expect(hintFor(getSnapshot(harvested), 'sunny-sprout')).toBe('Tap a plot to plant.');
  });

  it('keeps a standing goal once every seed is unlocked', () => {
    const level3 = { ...createInitialState(1, 0, { xp: 25 }), plantCount: 100, scriptedGiantUsed: true, scriptedGoldenUsed: true };
    expect(hintFor(getSnapshot(level3), 'sunny-sprout')).toBe('Save 40 coins for Plot 7 (12/40).');
    const full = step(level3, ['plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5']
      .map((plotId) => ({ type: 'Plant' as const, plotId, seedId: 'sunny-sprout' as const })), 0).state;
    expect(hintFor(getSnapshot(full), 'sunny-sprout')).toBe('Save 40 coins for Plot 7 (6/40).');
    expect(hintFor(getSnapshot(step(full, [], 8_000).state), 'sunny-sprout')).toBe('Buy Plot 7 (40/40).');
  });

  it('points to a cheaper seed when the selected one is unaffordable', () => {
    const poor = { ...createInitialState(1, 0, { xp: 30 }), coins: 2, plantCount: 100, scriptedGiantUsed: true, scriptedGoldenUsed: true };
    expect(hintFor(getSnapshot(poor), 'twistroot')).toBe('Save 40 coins for Plot 7 (2/40).');
  });

  it('keeps the Golden near-miss after the scripted Golden is used', () => {
    const state = { ...createInitialState(1, 0), scriptedGoldenUsed: true };
    const first = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const planted = step(first, [{ type: 'Plant', plotId: 'plot-2', seedId: 'sunny-sprout' }], 4_000).state;
    expect(getSnapshot(step(planted, [], 8_000).state).nearMiss)
      .toBe('Plant one more Sunny Sprout beside it for Golden.');
  });
});
