import { describe, expect, it } from 'vitest';
import { createInitialState, mutationRoll, nextRandom, step } from '../index';

const plant = (seed = 17, xp = 25, speciesId: 'twistroot' | 'sunny-sprout' = 'twistroot') =>
  step(createInitialState(seed, 0, { xp }), [{ type: 'Plant', plotId: 'plot-0', seedId: speciesId }], 0).state;

describe('M2 mutation engine', () => {
  it('keeps M1 size draws on the garden RNG stream', () => {
    const seed = 982;
    const first = step(createInitialState(seed, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0);
    const expected = nextRandom(seed >>> 0);
    const size = expected.value < 0.25 ? 'small' : expected.value < 0.85 ? 'regular' : 'big';
    expect(first.state.rngState).toBe(expected.nextState);
    expect(first.state.plots[0]?.plant?.size).toBe(size);
  });

  it('assigns the scripted Giant to one eligible Twistroot and stores it at Mature', () => {
    const state = plant();
    expect(state.scriptedGiantUsed).toBe(true);
    const grown = step(state, [], 22_000);
    expect(grown.state.plots[0]?.plant?.mutations).toEqual(['giant']);
    expect(grown.events).toContainEqual({ type: 'Mutated', plotId: 'plot-0', speciesId: 'twistroot', mutations: ['giant'], firstDiscovery: true });
    const next = step({ ...grown.state, coins: 100 }, [{ type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' }], 22_000);
    expect(next.state.plots[1]?.plant?.scriptedGiant).toBeUndefined();
    const sunny = step(createInitialState(1, 0, { xp: 25 }), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0);
    expect(sunny.state.plots[0]?.plant?.scriptedGiant).toBeUndefined();
  });

  it('waters twice only at level 4 and applies the rule chance at Mature', () => {
    const low = step(plant(25, 25), [{ type: 'Water', plotId: 'plot-0' }], 5_000);
    expect(step(low.state, [{ type: 'Water', plotId: 'plot-0' }], 6_000).events).toContainEqual(expect.objectContaining({ reason: 'already-watered' }));
    let high = plant(25, 50);
    high = step(high, [{ type: 'Water', plotId: 'plot-0' }], 5_000).state;
    high = step(high, [{ type: 'Water', plotId: 'plot-0' }], 6_000).state;
    expect(high.plots[0]?.plant?.waterCount).toBe(2);
    const favorable = Array.from({ length: 10_000 }, (_, index) => index).find((n) => mutationRoll(n, 'giant') < 0.4)!;
    high = { ...high, plots: high.plots.map((plot, i) => i ? plot : { ...plot, plant: { ...plot.plant!, mutationSeed: favorable } }) };
    expect(step(high, [], 22_000).state.plots[0]?.plant?.mutations).toEqual(['giant']);
  });

  it('counts rule-qualifying Giant misses without applying an unspecified guarantee', () => {
    let state = plant(31, 50);
    state = { ...state, scriptedGiantUsed: true, plots: state.plots.map((plot) => {
      if (!plot.plant) return plot;
      const { scriptedGiant, ...ordinaryPlant } = plot.plant;
      void scriptedGiant;
      return { ...plot, plant: ordinaryPlant };
    }) };
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 5_000).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 6_000).state;
    const miss = Array.from({ length: 10_000 }, (_, i) => i).find((n) => mutationRoll(n, 'giant') >= 0.4)!;
    state = { ...state, plots: state.plots.map((plot) => plot.id === 'plot-0' && plot.plant ? { ...plot, plant: { ...plot.plant, mutationSeed: miss } } : plot) };
    const matured = step(state, [], 22_000);
    expect(matured.state.badLuck.giant).toBe(1);
    expect(matured.state.plots[0]?.plant?.mutations).toEqual([]);
  });

  it('keeps Mature results and first discovery state on later steps', () => {
    const matured = step(plant(), [], 22_000).state;
    const continued = step(matured, [], 30_000);
    expect(continued.events).not.toContainEqual(expect.objectContaining({ type: 'Mutated' }));
    expect(matured.discoveries).toEqual(['twistroot:giant']);
    const duplicate = { ...matured, discoveries: ['twistroot:giant'], plots: matured.plots.map((plot) => {
      if (plot.id !== 'plot-0' || !plot.plant) return plot;
      const { mutations: _mutations, ...unmutated } = plot.plant;
      void _mutations;
      return { ...plot, plant: { ...unmutated, scriptedGiant: false, waterCount: 2, mutationSeed: Array.from({ length: 10_000 }, (_, i) => i).find((n) => mutationRoll(n, 'giant') < 0.4)! } };
    }) };
    expect(step(duplicate, [], 22_000).events).toContainEqual(expect.objectContaining({ type: 'Mutated', firstDiscovery: false }));
  });

  it('replays mutations for identical state, commands and times', () => {
    const state = plant();
    expect(step(state, [], 22_000)).toEqual(step(state, [], 22_000));
  });

  it('multiplies coins and XP by stored mutation values', () => {
    const initial = createInitialState(4, 0, { xp: 100 });
    const state = { ...initial, plots: initial.plots.map((plot, index) => index ? plot : { ...plot, plant: { speciesId: 'twistroot' as const, plantedAt: 0, size: 'regular' as const, mutationSeed: 1, mutations: ['giant', 'golden'] as const } }) };
    const result = step(state, [{ type: 'Harvest', plotIds: ['plot-0'] }], 30_001);
    expect(result.state.coins).toBe(initial.coins + 80);
    expect(result.state.xp).toBe(initial.xp + 80);
  });
});
