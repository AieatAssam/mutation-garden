import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from '../sim';
import { hintFor, mutationOpportunitiesFor } from './hints';

describe('first-minute hints', () => {
  it('walks the opening loop through planting, watering, harvest, sale and unlock', () => {
    const fresh = createInitialState(1, 0);
    expect(hintFor(getSnapshot(fresh), 'sunny-sprout')).toBe('Tap a plot to plant.');

    const planted = step(fresh, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    expect(hintFor(getSnapshot(planted), 'sunny-sprout')).toBe('Sell 3 Sunny Sprouts: 0/3.');
    expect(hintFor(getSnapshot(step(planted, [], 1_000).state), 'sunny-sprout')).toBe('Tap a growing plant to water it.');

    const ripe = step(planted, [], 8_000).state;
    expect(hintFor(getSnapshot(ripe), 'sunny-sprout')).toBe('Tap the ripe plant to harvest.');
    const harvested = step(ripe, [{ type: 'Harvest', plotIds: ['plot-0'] }], 8_000).state;
    expect(hintFor(getSnapshot(harvested), 'sunny-sprout')).toBe('Tap Sell to sell 1 fruit.');

    const selling = step(harvested, [{ type: 'StartSelling' }], 8_000).state;
    expect(hintFor(getSnapshot(selling), 'sunny-sprout')).toBe('Tap a plot to plant.');
    const sold = step(selling, [], 9_200).state;
    expect(getSnapshot(sold).crateCount).toBe(0);
    expect(hintFor(getSnapshot(sold), 'sunny-sprout')).toBe('Sell 3 Sunny Sprouts: 1/3.');
  });

  it('avoids invalid watering and Giant guidance once Mature', () => {
    const seeds = createInitialState(1, 0);
    const fullSeedBed = step(seeds, seeds.plots.map(({ id }) => ({ type: 'Plant' as const, plotId: id, seedId: 'sunny-sprout' as const })), 0).state;
    expect(hintFor(getSnapshot(fullSeedBed), 'sunny-sprout')).toBe('Sell 3 Sunny Sprouts: 0/3.');

    const planted = step(createInitialState(2, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const firstWater = step(planted, [{ type: 'Water', plotId: 'plot-0' }], 1_000).state;
    expect(hintFor(getSnapshot(firstWater), 'sunny-sprout')).toBe('Water it again to grow a Giant.');
    const twiceWatered = step(firstWater, [{ type: 'Water', plotId: 'plot-0' }], 1_800).state;
    expect(getSnapshot(twiceWatered).plots[0]?.plant).toMatchObject({ stage: 'Growing', waterCount: 2 });
    expect(hintFor(getSnapshot(twiceWatered), 'sunny-sprout')).not.toContain('Water');

    const emptyBed = createInitialState(3, 0);
    const fullBed = step(emptyBed, emptyBed.plots.map(({ id }) => ({ type: 'Plant' as const, plotId: id, seedId: 'sunny-sprout' as const })), 0).state;
    const mature = step(fullBed, [], 7_000).state;
    expect(getSnapshot(mature).plots[0]?.plant?.stage).toBe('Mature');
    expect(getSnapshot(mature).plots[0]?.plant?.mutations).toBeDefined();
    expect(hintFor(getSnapshot(mature), 'sunny-sprout')).toBe('Tap a growing plant to water it.');
    const lateWater = step(mature, [{ type: 'Water', plotId: 'plot-0' }], 7_000);
    expect(lateWater.events).not.toContainEqual({ type: 'Watered', plotId: 'plot-0' });
    expect(getSnapshot(lateWater.state).plots[0]?.plant?.mutations).toEqual(getSnapshot(mature).plots[0]?.plant?.mutations);
  });

  it('suggests an affordable seed when the selection cannot be planted', () => {
    const poorStart = { ...createInitialState(1, 0), coins: 2 };
    expect(hintFor(getSnapshot(poorStart), 'twistroot')).toBe('Select Sunny Sprout to plant.');
  });

  it('keeps the active order visible after seed unlocks', () => {
    const level3 = { ...createInitialState(1, 0, { xp: 900 }), plantCount: 100, scriptedGiantUsed: true, scriptedGoldenUsed: true };
    expect(hintFor(getSnapshot(level3), 'sunny-sprout')).toBe('Sell 3 Sunny Sprouts: 0/3.');
    const full = step(level3, ['plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5']
      .map((plotId) => ({ type: 'Plant' as const, plotId, seedId: 'sunny-sprout' as const })), 0).state;
    expect(hintFor(getSnapshot(full), 'sunny-sprout')).toBe('Sell 3 Sunny Sprouts: 0/3.');
    const rich = { ...full, coins: 80 };
    expect(hintFor(getSnapshot({ ...rich, order: { index: 0, progress: 2 } }), 'sunny-sprout')).toBe('Sell 3 Sunny Sprouts: 2/3.');
  });

  it('suppresses a Golden near-miss when no affordable seed can complete it', () => {
    const state = { ...createInitialState(1, 0), scriptedGoldenUsed: true };
    const planted = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
    ], 0).state;
    const nearMiss = getSnapshot(step(planted, [], 4_000).state);
    expect(nearMiss.nearMiss).toBe('Plant one more Sunny Sprout beside it for Golden.');
    const noCoins = getSnapshot({ ...planted, coins: 0 });
    expect(noCoins.nearMiss).toBeNull();
    expect(hintFor(noCoins, 'sunny-sprout')).not.toContain('Golden');
  });

  it('shows live recipe counts and clears them after mutation results freeze', () => {
    const fresh = createInitialState(1, 0);
    expect(mutationOpportunitiesFor(getSnapshot(fresh))).toEqual({ giant: [], golden: [], glowing: [] });
    const planted = step(fresh, ['plot-0', 'plot-1', 'plot-2'].map((plotId) => ({ type: 'Plant' as const, plotId, seedId: 'sunny-sprout' as const })), 0).state;
    const watered = step(planted, [{ type: 'Water', plotId: 'plot-1' }], 1_000).state;
    expect(mutationOpportunitiesFor(getSnapshot(watered))).toMatchObject({
      giant: ['Plot 2: 1/2 waters.'], golden: ['Plot 1: 2/2 Sunny neighbours.'],
    });
    expect(mutationOpportunitiesFor(getSnapshot(step(watered, [], 8_000).state))).toEqual({ giant: [], golden: [], glowing: [] });
  });
});
