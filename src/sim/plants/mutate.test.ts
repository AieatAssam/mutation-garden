import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, mutationRoll, nextRandom, step, type GardenState } from '../index';

describe('M2 mutation rules', () => {
  it('keeps planting size draws on the garden RNG stream', () => {
    const seed = 982;
    const result = step(createInitialState(seed, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0);
    expect(result.state.rngState).toBe(nextRandom(seed >>> 0).nextState);
  });

  it('always gives Giant after two waters from level one', () => {
    let state = step(createInitialState(8, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 4_000).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 5_000).state;
    const result = step(state, [], 18_000);
    expect(result.state.plots[0]?.plant?.mutations).toContain('giant');
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'Mutated', firstTraitDiscoveries: ['giant'] }));
  });

  it('grants Giant for two accepted pre-maturity waters without rerolling natural traits', () => {
    let state = step(createInitialState(8, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 2_000).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 5_000).state;
    expect(state.plots[0]?.plant?.waterCount).toBe(2);
    expect(state.plots[0]?.plant?.mutations).toContain('giant');
  });

  it('always gives Golden beside two Sunny Sprouts', () => {
    let state = createInitialState(9, 0, { xp: 900 });
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'sunny-sprout' },
    ], 0).state;
    state = step(state, [], 25_001).state;
    expect(state.plots[1]?.plant?.mutations).toContain('golden');
  });

  it('pays ten mutated base values in coins and XP for an early Golden', () => {
    let state = createInitialState(91, 0);
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'sunny-sprout' },
    ], 0).state;

    const result = step(state, [], 8_000);
    expect(result.state.xp).toBe(80);
    expect(result.state.coins).toBe(89);
    expect(result.state.plots[1]?.plant?.mutations).toEqual(['golden']);
  });

  it('does not count a Sunny Sprout as its own Golden neighbour', () => {
    const planted = step(createInitialState(90, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    expect(step(planted, [], 24_000).state.plots[0]?.plant?.mutations ?? []).not.toContain('golden');
  });

  it('shows Golden only when an eligible plant has an adjacent empty plot and coins for Sunny', () => {
    let sunny = createInitialState(21, 0);
    sunny = step(sunny, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
    ], 0).state;
    expect(getSnapshot(sunny).nearMiss).toBe('Plant one more Sunny Sprout beside it for Golden.');

    let state = createInitialState(21, 0, { xp: 900 });
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
    ], 0).state;
    expect(getSnapshot(state).nearMiss).toBe('Plant one more Sunny Sprout beside it for Golden.');

    const noCoins = { ...state, coins: 0 };
    expect(getSnapshot(noCoins).nearMiss).toBeNull();

    const blocked = step(state, [{ type: 'Plant', plotId: 'plot-3', seedId: 'bubble-berry' }], 0).state;
    expect(getSnapshot(blocked).nearMiss).toBeNull();

    let full = { ...createInitialState(22, 0, { xp: 900 }), coins: 14 };
    full = step(full, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-2', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'bubble-berry' },
      { type: 'Plant', plotId: 'plot-4', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-5', seedId: 'sunny-sprout' },
    ], 0).state;
    expect(full.plots.every(({ plant }) => plant !== null)).toBe(true);
    expect(getSnapshot(full).nearMiss).toBeNull();
  });

  it('always gives Glowing beside a Puffcap', () => {
    let state = createInitialState(10, 0, { xp: 2_500 });
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'puffcap' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
    ], 0).state;
    state = step(state, [], 30_001).state;
    expect(state.plots[1]?.plant?.mutations).toContain('glowing');
  });

  it('guarantees Frozen beside a growing Dewbell at maturity', () => {
    const initial = createInitialState(110, 40_000, { xp: 10_300 });
    const state = { ...initial, plots: initial.plots.map((plot) => plot.id === 'plot-0'
      ? { ...plot, plant: { speciesId: 'dewbell' as const, plantedAt: 0, mutationSeed: 1 } }
      : plot.id === 'plot-1' ? { ...plot, plant: { speciesId: 'sunny-sprout' as const, plantedAt: 33_000, mutationSeed: 2 } } : plot) };
    expect(step(state, [], 40_000).state.plots[1]?.plant?.mutations).toContain('frozen');
  });

  it('guarantees Electric after two sprinkler waters before maturity', () => {
    const initial = createInitialState(111, 0, { xp: 10_300 });
    let state: GardenState = { ...initial, owned: ['sprinkler', 'sprinkler-2'],
      plots: initial.plots.map((plot) => plot.id === 'plot-0'
        ? { ...plot, plant: { speciesId: 'bubble-berry' as const, plantedAt: 0, mutationSeed: 3 } } : plot) };
    for (let now = 1_000; now <= 20_000; now += 1_000) state = step(state, [], now).state;
    const result = { state };
    expect(result.state.plots[0]?.plant).toMatchObject({ sprinklerWaterCount: 2, mutations: expect.arrayContaining(['electric']) });
  });

  it('captures Twin eligibility beside mature Clockvine when planting', () => {
    const initial = createInitialState(112, 60_000, { xp: 15_000 });
    const state: GardenState = { ...initial, coins: 100, plots: initial.plots.map((plot) => plot.id === 'plot-0'
      ? { ...plot, plant: { speciesId: 'clockvine', plantedAt: 0, mutationSeed: 4 } } : plot) };
    const planted = step(state, [{ type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' }], 60_000).state;
    expect(planted.plots[1]?.plant?.twinReady).toBe(true);
    expect(step(planted, [], 68_000).state.plots[1]?.plant?.mutations).toContain('twin');
  });

  it('does not give Twin when Clockvine matures after planting', () => {
    const initial = createInitialState(113, 0, { xp: 15_000 });
    const state: GardenState = { ...initial, coins: 100, plots: initial.plots.map((plot) => plot.id === 'plot-0'
      ? { ...plot, plant: { speciesId: 'clockvine', plantedAt: 0, mutationSeed: 4 } } : plot) };
    const planted = step(state, [{ type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' }], 0).state;
    expect(planted.plots[1]?.plant?.twinReady).toBeUndefined();
    expect(step(planted, [], 8_000).state.plots[1]?.plant?.mutations).not.toContain('twin');
  });

  it('keeps Frozen deterministic across catch-up steps when Dewbell is growing at maturity', () => {
    const initial = createInitialState(114, 10_000, { xp: 0 });
    const state = { ...initial, plots: initial.plots.map((plot) => plot.id === 'plot-0'
      ? { ...plot, plant: { speciesId: 'dewbell' as const, plantedAt: 0, mutationSeed: 1 } }
      : plot.id === 'plot-1' ? { ...plot, plant: { speciesId: 'sunny-sprout' as const, plantedAt: 10_000, mutationSeed: 2 } } : plot) };
    let ticked: GardenState = state;
    for (let now = 11_000; now <= 100_000; now += 1_000) ticked = step(ticked, [], now).state;
    const caughtUp = step(state, [], 100_000).state;
    expect(caughtUp.plots[1]?.plant?.mutations).toEqual(ticked.plots[1]?.plant?.mutations);
    expect(caughtUp.plots[1]?.plant?.mutations).toContain('frozen');
  });

  it('primes Crystal only from a Glowing harvest on pond-side plot 0 or 2', () => {
    const glowing = { speciesId: 'sunny-sprout' as const, plantedAt: 0, size: 'regular' as const, mutationSeed: 1, mutations: ['glowing' as const] };
    const initial = createInitialState(50, 8_000, { xp: 900 });
    const state = { ...initial, plots: initial.plots.map((plot) => plot.id === 'plot-0' ? { ...plot, plant: glowing } : plot) };
    const harvest = step(state, [{ type: 'Harvest', plotIds: ['plot-0'] }], 8_000);
    expect(harvest.state.crystalReadyPlots).toEqual(['plot-0']);
    const planted = step({ ...harvest.state, badLuck: { ...harvest.state.badLuck, crystal: 39 } },
      [{ type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' }], 8_000);
    const mature = step(planted.state, [], 23_000);
    expect(mature.state.plots[0]?.plant?.mutations).toContain('crystal');
    expect(mature.state.crystalReadyPlots).toEqual([]);
  });

  it('uses the 30% Crystal rule roll on a qualified plot', () => {
    const mutationSeed = Array.from({ length: 1000 }, (_, seed) => seed).find((seed) => mutationRoll(seed!, 'crystal') < 0.3)!;
    const state = createInitialState(51, 15_000, { xp: 900 });
    const qualified = { ...state, crystalReadyPlots: ['plot-2'], plots: state.plots.map((plot) => plot.id === 'plot-2'
      ? { ...plot, plant: { speciesId: 'bubble-berry' as const, plantedAt: 0, size: 'regular' as const, mutationSeed } } : plot) };
    expect(step(qualified, [], 15_000).state.plots[2]?.plant?.mutations).toContain('crystal');
  });

  it('flags every harvested Golden, Glowing and Crystal plot for one Rainbow seed', () => {
    let state = createInitialState(52, 30_000, { xp: 900 });
    const mutations = [['golden'], ['glowing'], ['crystal']] as const;
    state = { ...state, plots: state.plots.map((plot, index) => index < 3 ? { ...plot,
      plant: { speciesId: 'sunny-sprout', plantedAt: 0, size: 'regular', mutationSeed: 0, mutations: mutations[index]! } } : plot) };
    const harvest = step(state, [{ type: 'Harvest', plotIds: ['plot-0', 'plot-1', 'plot-2'] }], 30_000);
    expect(harvest.state.rainbowPlots).toEqual(['plot-0', 'plot-1', 'plot-2']);
    expect(harvest.state.crate.map(({ mutations: found }) => found)).toEqual([['golden'], ['glowing'], ['crystal']]);
    expect(harvest.state.crate.map(({ value }) => value)).toEqual([11, 25, 17]);
    expect(harvest.events).toContainEqual({ type: 'HarvestCompleted', count: 3, coins: 0, comboBonus: 15 });
    const planted = step(harvest.state, [{ type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' }], 30_000);
    expect(planted.state.plots[1]?.plant?.rainbow).toBe(true);
    expect(planted.state.rainbowPlots).toEqual(['plot-0', 'plot-2']);
    expect(step(planted.state, [], 38_000).state.plots[1]?.plant?.mutations).toContain('rainbow');
  });

  it('pays each species-trait first-find reward once', () => {
    let state = createInitialState(11, 0, { xp: 900 });
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'sunny-sprout' },
    ], 0).state;
    const first = step(state, [], 25_001);
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'Mutated', speciesId: 'twistroot', bonusCoins: 400, bonusXp: 400 }));
    const twistrootMutation = first.events.find((event) => event.type === 'Mutated' && event.speciesId === 'twistroot');
    expect(twistrootMutation).toMatchObject({ firstTraitDiscoveries: expect.arrayContaining(['golden']), bonusCoinsByTrait: { golden: 400 } });
    const firstBonusXp = first.events.filter((event) => event.type === 'Mutated').reduce((total, event) => total + event.bonusXp, 0);
    expect(first.state.xp).toBe(state.xp + firstBonusXp);
    expect(first.state.rewardsPaid).toContain('twistroot:golden');
    const second = step({ ...first.state, plots: first.state.plots.map((plot) => {
      if (plot.id !== 'plot-1' || !plot.plant) return plot;
      const { mutations: _mutations, ...unmutated } = plot.plant;
      void _mutations;
      return { ...plot, plant: unmutated };
    }) }, [], 25_002);
    expect(second.state.rewardsPaid.filter((id) => id === 'twistroot:golden')).toHaveLength(1);
    expect(second.events).toContainEqual(expect.objectContaining({ type: 'Mutated', bonusCoins: 0, bonusXp: 0 }));
    const repeatedGolden = second.events.find((event) => event.type === 'Mutated' && event.speciesId === 'twistroot');
    expect(repeatedGolden?.type === 'Mutated' && repeatedGolden.firstTraitDiscoveries).not.toContain('golden');
  });

  it('reveals each global trait and trait pair only once, while retaining species rewards', () => {
    let state = createInitialState(11, 0, { xp: 900 });
    state = { ...state, discoveries: ['sunny-sprout:golden'] };
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'sunny-sprout' },
    ], 0).state;
    state = { ...state, plots: state.plots.map((plot) => plot.id === 'plot-1' && plot.plant
      ? { ...plot, plant: { ...plot.plant, waterCount: 2 } } : plot) };
    const first = step(state, [], 25_001);
    const mutation = first.events.find((event) => event.type === 'Mutated' && event.speciesId === 'twistroot');
    expect(mutation).toMatchObject({ firstDiscovery: true, bonusCoinsByTrait: { golden: 400 } });
    expect(mutation?.type === 'Mutated' && mutation.firstTraitDiscoveries).not.toContain('golden');
    expect(mutation?.type === 'Mutated' && mutation.firstPairDiscoveries).toContainEqual(['giant', 'golden']);

    const retry = step({ ...first.state, plots: first.state.plots.map((plot) => {
      if (plot.id !== 'plot-1' || !plot.plant) return plot;
      const { mutations: _mutations, ...plant } = plot.plant;
      void _mutations;
      return { ...plot, plant };
    }) }, [], 25_002);
    const repeated = retry.events.find((event) => event.type === 'Mutated' && event.speciesId === 'twistroot');
    expect(repeated?.type === 'Mutated' && repeated.firstTraitDiscoveries).not.toContain('golden');
    expect(repeated?.type === 'Mutated' && repeated.firstPairDiscoveries).not.toContainEqual(['giant', 'golden']);
  });
});
