import { describe, expect, it } from 'vitest';
import { createInitialState, step } from '../sim';
import { advanceOffline, capClockOffset, OFFLINE_CAP_MS } from './offline';

describe('offline catch-up', () => {
  it('caps advancement at two hours and ignores a backwards wall clock', () => {
    const initial = createInitialState(7, 0);
    const capped = advanceOffline(initial, 0, OFFLINE_CAP_MS * 3);
    expect(capped.elapsedMs).toBe(OFFLINE_CAP_MS);
    expect(capped.state.lastNowMs).toBe(OFFLINE_CAP_MS);

    const backwards = advanceOffline(initial, 100, 90);
    expect(backwards.elapsedMs).toBe(0);
    expect(backwards.state).toBe(initial);
  });

  it('keeps the two-hour cap when the live loop resumes', () => {
    const offset = capClockOffset(0, 10_000, 10_000 + OFFLINE_CAP_MS * 3);
    expect(10_000 + OFFLINE_CAP_MS * 3 - offset).toBe(10_000 + OFFLINE_CAP_MS);
    expect(capClockOffset(offset, 10_000 + OFFLINE_CAP_MS, 10_000 + OFFLINE_CAP_MS * 3 + 1_000)).toBe(offset);
  });

  it('credits queued sales once, then leaves the replayed interval unchanged', () => {
    const initial = createInitialState(7, 0);
    const queued = {
      ...initial,
      crate: [{ speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 4, xp: 4 }],
      sellingSince: 0,
    };
    const first = advanceOffline(queued, 0, 10_000);
    expect(first.coinsSold).toBe(6);
    expect(first.state.coins).toBe(initial.coins + 6);
    expect(first.state.crate).toEqual([]);
    expect(first.crateContents).toEqual([]);

    const replay = advanceOffline(first.state, 0, 10_000);
    expect(replay.coinsSold).toBe(0);
    expect(replay.state.coins).toBe(first.state.coins);
  });

  it('reports plants that ripen and their ripe plot IDs', () => {
    const initial = createInitialState(7, 0);
    const planted = {
      ...initial,
      plots: initial.plots.map((plot) => plot.id === 'plot-0'
        ? { ...plot, plant: { speciesId: 'sunny-sprout' as const, plantedAt: 0, mutationSeed: 1 } }
        : plot),
    };
    const result = advanceOffline(planted, 0, 8_000);
    expect(result.plantsGrown).toBe(1);
    expect(result.ripePlotIds).toEqual(['plot-0']);
    expect(result.plotsWatered).toBe(0);
    expect(result.fruitHarvested).toBe(0);
  });

  it('keeps offline mutation events so boot can show their reveal', () => {
    const initial = createInitialState(7, 0);
    const state = {
      ...initial,
      plantCount: 2,
      scriptedGiantUsed: false,
      plots: initial.plots.map((plot) => plot.id === 'plot-0'
        ? { ...plot, plant: { speciesId: 'twistroot' as const, plantedAt: 0, mutationSeed: 1, waterCount: 2 } }
        : plot),
    };
    const result = advanceOffline(state, 0, 25_000);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'Mutated', speciesId: 'twistroot', firstDiscovery: true, bonusCoins: 200,
    }));
  });

  it('groups the crate contents that remain after offline sales', () => {
    const initial = createInitialState(7, 0);
    const fruit = { speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 2, xp: 2 };
    const result = advanceOffline({ ...initial, crate: [fruit, fruit] }, 0, 31_000);
    expect(result.coinsSold).toBe(0);
    expect(result.crateContents).toEqual([{ speciesId: 'sunny-sprout', count: 2 }]);
  });

  it('produces the same automation state for split and continuous absence intervals', () => {
    const initial = createInitialState(51, 0, { xp: 15_000 });
    const bought = step({ ...initial, coins: 5_000 }, [
      { type: 'Buy', item: 'seed-hopper' }, { type: 'Buy', item: 'harvest-helper' },
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
    ], 0).state;
    const whole = advanceOffline(bought, 0, 30_000);
    const firstHalf = advanceOffline(bought, 0, 13_000);
    const secondHalf = advanceOffline(firstHalf.state, 13_000, 30_000);
    expect(secondHalf.state).toEqual(whole.state);
    expect([...firstHalf.events, ...secondHalf.events]).toEqual(whole.events);
  });
});
