import { describe, expect, it } from 'vitest';
import { createInitialState, step, type Fruit, type GardenState, type PlantState } from '../index';

const base = createInitialState(7, 0, { xp: 10_300 });
function withPlants(plants: Readonly<Record<string, PlantState | null>>, crate: readonly Fruit[] = []): GardenState {
  return { ...base, crate, plots: base.plots.map((plot) => ({
    ...plot, plant: Object.hasOwn(plants, plot.id) ? plants[plot.id] ?? null : null,
  })) };
}

describe('new species hooks', () => {
  it('Clockvine gains two seconds from each ripe neighbor once and saves the neighbor IDs', () => {
    const state = withPlants({
      'plot-0': { speciesId: 'clockvine', plantedAt: 0, mutationSeed: 1 },
      'plot-1': { speciesId: 'sunny-sprout', plantedAt: 2_000, mutationSeed: 2 },
    });
    const first = step(state, [], 10_000);
    expect(first.state.plots[0]?.plant).toMatchObject({ clockBoostMs: 2_000, clockBoostedBy: ['plot-1'] });
    const second = step(first.state, [], 10_100);
    expect(second.state.plots[0]?.plant).toMatchObject({ clockBoostMs: 2_000, clockBoostedBy: ['plot-1'] });
  });

  it('caps a Clockvine boost at its remaining growth time', () => {
    const state = withPlants({
      'plot-0': { speciesId: 'clockvine', plantedAt: 0, mutationSeed: 1 },
      'plot-1': { speciesId: 'sunny-sprout', plantedAt: 46_000, mutationSeed: 2 },
    });
    const grown = step(state, [], 54_000);
    expect(grown.state.plots[0]?.plant).toMatchObject({ clockBoostMs: 1_000, clockBoostedBy: ['plot-1'] });
    expect(step(grown.state, [{ type: 'Harvest', plotIds: ['plot-0'] }], 54_000).events)
      .toContainEqual(expect.objectContaining({ type: 'Harvested', plotId: 'plot-0', fresh: true }));
  });

  it('does not move a ripe Clockvine earlier and steal its fresh window', () => {
    const state = withPlants({
      'plot-0': { speciesId: 'clockvine', plantedAt: 0, mutationSeed: 1 },
      'plot-1': { speciesId: 'sunny-sprout', plantedAt: 51_000, mutationSeed: 2 },
    });
    const ripe = step(state, [], 59_000);
    expect(ripe.state.plots[0]?.plant?.clockBoostMs).toBeUndefined();
    expect(ripe.state.plots[0]?.plant?.clockBoostedBy).toBeUndefined();
    expect(step(ripe.state, [{ type: 'Harvest', plotIds: ['plot-0'] }], 59_000).events)
      .toContainEqual(expect.objectContaining({ type: 'Harvested', plotId: 'plot-0', fresh: true }));
  });

  it('ripe Dewbell waters one orthogonal growing neighbor once', () => {
    const state = withPlants({
      'plot-0': { speciesId: 'dewbell', plantedAt: 0, mutationSeed: 1 },
      'plot-1': { speciesId: 'clockvine', plantedAt: 80_000, mutationSeed: 2 },
    });
    const result = step(state, [], 90_000);
    expect(result.state.plots[0]?.plant).toMatchObject({ dewUsed: true });
    expect(result.state.plots[1]?.plant).toMatchObject({ waterCount: 1, clockBoostMs: 2_000, clockBoostedBy: ['plot-0'], boostMs: 12_900 });
    expect(result.events).toContainEqual({ type: 'Watered', plotId: 'plot-1' });
    const again = step(result.state, [], 90_100);
    expect(again.state.plots[1]?.plant?.boostMs).toBe(12_900);
  });

  it('Comet Pear keeps its ripe plant when two crate spaces are unavailable', () => {
    const fruit: Fruit = { speciesId: 'sunny-sprout', size: 'regular', mutations: [], value: 2, xp: 2 };
    const plant: PlantState = { speciesId: 'comet-pear', plantedAt: 0, mutationSeed: 1 };
    const full = withPlants({ 'plot-0': plant }, Array.from({ length: 11 }, () => fruit));
    const rejected = step(full, [{ type: 'Harvest', plotIds: ['plot-0'] }], 75_000);
    expect(rejected.state.plots[0]?.plant).not.toBeNull();
    expect(rejected.state.crate).toHaveLength(11);
    expect(rejected.events).toContainEqual({ type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'crate-full' });

    const room = withPlants({ 'plot-0': plant }, Array.from({ length: 10 }, () => fruit));
    const harvested = step(room, [{ type: 'Harvest', plotIds: ['plot-0'] }], 75_000);
    expect(harvested.state.plots[0]?.plant).toBeNull();
    expect(harvested.state.crate.filter(({ speciesId }) => speciesId === 'comet-pear')).toHaveLength(2);
  });
});
