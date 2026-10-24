import { describe, expect, it } from 'vitest';
import { createInitialState, nextRandom, step } from '../index';

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
    expect(step(state, [], 18_000).state.plots[0]?.plant?.mutations).toContain('giant');
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

  it('pays half a level of XP and three mutated harvest values for an early Golden', () => {
    let state = createInitialState(91, 0);
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'sunny-sprout' },
    ], 0).state;

    const result = step(state, [], 8_000);
    expect(result.state.xp).toBe(250);
    expect(result.state.coins).toBe(33);
    expect(result.state.plots[1]?.plant?.mutations).toEqual(['golden']);
  });

  it('does not count a Sunny Sprout as its own Golden neighbour', () => {
    const planted = step(createInitialState(90, 0), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    expect(step(planted, [], 24_000).state.plots[0]?.plant?.mutations ?? []).not.toContain('golden');
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

  it('pays each species-trait first-find reward once', () => {
    let state = createInitialState(11, 0, { xp: 900 });
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-3', seedId: 'sunny-sprout' },
    ], 0).state;
    const first = step(state, [], 25_001);
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'Mutated', speciesId: 'twistroot', bonusCoins: 120 }));
    expect(first.state.xp).toBe(2_100);
    expect(first.state.rewardsPaid).toContain('twistroot:golden');
    const second = step({ ...first.state, plots: first.state.plots.map((plot) => {
      if (plot.id !== 'plot-1' || !plot.plant) return plot;
      const { mutations: _mutations, ...unmutated } = plot.plant;
      void _mutations;
      return { ...plot, plant: unmutated };
    }) }, [], 25_002);
    expect(second.state.rewardsPaid.filter((id) => id === 'twistroot:golden')).toHaveLength(1);
    expect(second.events).toContainEqual(expect.objectContaining({ type: 'Mutated', bonusCoins: 0 }));
  });
});
