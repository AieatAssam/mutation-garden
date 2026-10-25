import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/initial';
import { step } from '../state/step';
import { xpForLevel } from '../content/species';
import { mutationRoll } from '../content/mutations';

describe('watering automation', () => {
  it('waters each growing centre plant twice at tier two and does not repeat at the same timestamp', () => {
    const initial = createInitialState(19, 0, { xp: 6_500 });
    const bought = step({ ...initial, coins: 1_000 }, [{ type: 'Buy', item: 'sprinkler' }, { type: 'Buy', item: 'sprinkler-2' }], 0).state;
    const planted = step(bought, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const watered = step(planted, [], 2_000).state.plots[0]!.plant!;
    expect(watered.waterCount).toBe(2);
    expect(watered.sprinklerWaterCount).toBe(2);
    expect(step(step(planted, [], 2_000).state, [], 2_000).state.plots[0]!.plant).toEqual(watered);
  });

  it('rejects locked automation purchases without charging coins', () => {
    const initial = createInitialState(23, 0);
    const result = step({ ...initial, coins: 1_000 }, [{ type: 'Buy', item: 'sprinkler' }], 0);
    expect(result.state.coins).toBe(1_000);
    expect(result.state.owned).not.toContain('sprinkler');
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'CommandRejected', reason: 'locked' }));
  });

  it('marks each growing neighbour visited by the bee hive once', () => {
    const initial = createInitialState(31, 0, { xp: 6_500 });
    const bought = step({ ...initial, coins: 1_000 }, [{ type: 'Buy', item: 'bee-hive' }], 0).state;
    const planted = step(bought, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const visited = step(planted, [], 2_000).state.plots[0]!.plant!;
    expect(visited.beeVisited).toBe(true);
    expect(step(step(planted, [], 2_000).state, [], 2_000).state.plots[0]!.plant).toEqual(visited);
  });

  it('adds ten points to the crystal rule chance for a bee-visited plant', () => {
    const mutationSeed = Array.from({ length: 10_000 }, (_, seed) => seed)
      .find((seed) => mutationRoll(seed, 'crystal') >= 0.3 && mutationRoll(seed, 'crystal') < 0.4)!;
    const initial = createInitialState(39, 0, { xp: 6_500 });
    const planted = { ...initial, crystalReadyPlots: ['plot-0'], plots: initial.plots.map((plot) => plot.id === 'plot-0'
      ? { ...plot, plant: { speciesId: 'sunny-sprout' as const, plantedAt: 0, mutationSeed, beeVisited: true } } : plot) };
    expect(step(planted, [], 7_000).state.plots[0]!.plant?.mutations).toContain('crystal');
  });

  it('replants the last seed after a successful harvest and lets the ordinary plant rule charge it', () => {
    const initial = createInitialState(37, 0, { xp: 8_300 });
    const bought = step({ ...initial, coins: 1_000 }, [{ type: 'Buy', item: 'seed-hopper' }], 0).state;
    const planted = step(bought, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const harvested = step(planted, [{ type: 'Harvest', plotIds: ['plot-0'] }], 8_000);
    expect(harvested.state.plots[0]!.plant?.speciesId).toBe('sunny-sprout');
    expect(harvested.state.plots[0]!.lastSeedId).toBe('sunny-sprout');
    expect(harvested.state.coins).toBe(planted.coins - 1);
  });

  it('has the helper wait for ripe fruit and respects crate capacity', () => {
    const initial = createInitialState(41, 0, { xp: 15_000 });
    const ripe = { ...initial, owned: ['harvest-helper'] as const,
      plots: initial.plots.map((plot) => plot.id === 'plot-0' ? { ...plot, plant: { speciesId: 'sunny-sprout' as const, plantedAt: 0, mutationSeed: 1, mutations: [] } } : plot),
      crate: Array.from({ length: 12 }, () => ({ speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 2, xp: 2 })) };
    expect(step(ripe, [], 15_999).state.plots[0]!.plant).not.toBeNull();
    const full = step(ripe, [], 16_000).state;
    expect(full.crate).toHaveLength(12);
    expect(full.plots[0]!.plant).not.toBeNull();
  });

  it('starts cart sales through the ordinary stall queue and pays the stored value', () => {
    const initial = createInitialState(43, 0);
    const state = { ...initial, owned: ['delivery-cart'] as const,
      crate: [{ speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 7, xp: 2 }] };
    const started = step(state, [], 1_000).state;
    expect(started.sellingSince).toBe(1_000);
    const sold = step(started, [], 2_200);
    expect(sold.state.coins).toBe(initial.coins + 7);
    expect(sold.state.crate).toHaveLength(0);
  });

  it('gates Auto-sell on both level 12 and 1,200 coins', () => {
    const initial = createInitialState(47, 0, { xp: xpForLevel(12) });
    const short = step({ ...initial, coins: 1_199 }, [{ type: 'Buy', item: 'delivery-cart' }], 0);
    expect(short.state.owned).not.toContain('delivery-cart');
    expect(short.state.coins).toBe(1_199);
    const bought = step({ ...initial, coins: 1_200 }, [{ type: 'Buy', item: 'delivery-cart' }], 0);
    expect(bought.state.owned).toContain('delivery-cart');
    expect(bought.state.coins).toBe(0);
  });

});
