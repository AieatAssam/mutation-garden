import { describe, expect, it } from 'vitest';
import { SPECIES } from '../content/species';
import { createInitialState, step, type Command, type GardenState, type PlantState, type SpeciesId } from '../index';

const seed = 0x12345678;
const startTime = 10_000;

function stateWithPlants(
  plants: Readonly<Record<string, PlantState | null>>,
  nowMs = startTime,
): GardenState {
  const initial = createInitialState(seed, nowMs, { xp: 100 });
  return {
    ...initial,
    lastNowMs: nowMs,
    plots: initial.plots.map((plot) => ({
      ...plot,
      plant: Object.hasOwn(plants, plot.id) ? plants[plot.id] ?? null : null,
    })),
  };
}

function plantAt(speciesId: SpeciesId, plantedAt: number) {
  return { speciesId, plantedAt };
}

function harvest(...plotIds: string[]): Command {
  return { type: 'Harvest', plotIds };
}

describe('Harvest commands', () => {
  it.each(SPECIES)(
    'keeps %s unavailable at duration minus one and pays its exact value at maturity',
    (species) => {
      const plantedAt = startTime;
      const planted = stateWithPlants({ 'plot-0': plantAt(species.id, plantedAt) });

      const beforeMaturity = step(
        planted,
        [harvest('plot-0')],
        plantedAt + species.growthDurationMs - 1,
      );
      expect(beforeMaturity.state.coins).toBe(planted.coins);
      expect(beforeMaturity.state.plots[0]?.plant).toEqual(plantAt(species.id, plantedAt));
      expect(beforeMaturity.events).toContainEqual({
        type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'not-harvestable',
      });
      expect(beforeMaturity.events.some((event) => event.type === 'HarvestCompleted')).toBe(false);

      const atMaturity = step(
        beforeMaturity.state,
        [harvest('plot-0')],
        plantedAt + species.growthDurationMs,
      );
      // Harvesting the moment it ripens is fresh: +25%, rounded down.
      const paid = Math.floor(species.baseValue * 1.25);
      expect(atMaturity.state.coins).toBe(beforeMaturity.state.coins + paid);
      expect(atMaturity.state.plots[0]?.plant).toBeNull();
      expect(atMaturity.events).toEqual([
        { type: 'Harvestable', plotId: 'plot-0' },
        { type: 'Harvested', plotId: 'plot-0', speciesId: species.id, coins: paid, size: 'regular', fresh: true },
        { type: 'HarvestCompleted', count: 1, coins: paid, comboBonus: 0 },
      ]);
    },
  );

  it('processes ripe, unknown, empty and unripe targets with exact event order', () => {
    const state = stateWithPlants({
      'plot-0': plantAt('sunny-sprout', startTime - 8_000),
      'plot-1': null,
      'plot-2': plantAt('bubble-berry', startTime - 14_999),
    });

    const result = step(state, [harvest('plot-0', 'missing-plot', 'plot-1', 'plot-2')], startTime);

    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 2, size: 'regular', fresh: true },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'missing-plot', reason: 'unknown-plot' },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-1', reason: 'empty' },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-2', reason: 'not-harvestable' },
      { type: 'HarvestCompleted', count: 1, coins: 2, comboBonus: 0 },
    ]);
    expect(result.state.coins).toBe(state.coins + 2);
    expect(result.state.plots.map(({ plant }) => plant)).toEqual([
      null,
      null,
      plantAt('bubble-berry', startTime - 14_999),
      null,
      null,
      null,
    ]);
  });

  it('deduplicates valid and invalid plot IDs in first-occurrence order', () => {
    const state = stateWithPlants({
      'plot-0': plantAt('sunny-sprout', startTime - 8_000),
      'plot-1': plantAt('bubble-berry', startTime - 15_000),
    });

    const result = step(state, [harvest('plot-1', 'bad-plot', 'plot-0', 'plot-1', 'bad-plot', 'plot-0')], startTime);

    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-1', speciesId: 'bubble-berry', coins: 7, size: 'regular', fresh: true },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'bad-plot', reason: 'unknown-plot' },
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 2, size: 'regular', fresh: true },
      { type: 'HarvestCompleted', count: 2, coins: 9, comboBonus: 0 },
    ]);
    expect(result.state.coins).toBe(state.coins + 9);
    expect(result.state.plots.slice(0, 2).map(({ plant }) => plant)).toEqual([null, null]);
  });

  it('accepts an empty batch without events or state changes', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const result = step(state, [harvest()], startTime);

    expect(result).toEqual({ state, events: [] });
  });

  it('pays once when duplicate Harvest commands target the same plot in one step', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const result = step(state, [harvest('plot-0'), harvest('plot-0')], startTime);

    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 2, size: 'regular', fresh: true },
      { type: 'HarvestCompleted', count: 1, coins: 2, comboBonus: 0 },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'empty' },
    ]);
    expect(result.state.coins).toBe(state.coins + 2);
  });

  it('rejects a fast second harvest across steps after the first harvest clears the plot', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const first = step(state, [harvest('plot-0')], startTime);
    const second = step(first.state, [harvest('plot-0')], startTime + 1);

    expect(second.state.coins).toBe(first.state.coins);
    expect(second.state.plots[0]?.plant).toBeNull();
    expect(second.events).toEqual([
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'empty' },
    ]);
  });

  it('applies harvest then plant sequentially so the cleared plot can be replanted', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const result = step(state, [harvest('plot-0'), {
      type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry',
    }], startTime);

    expect(result.state.coins).toBe(state.coins + 2 - 3);
    expect(result.state.plots[0]?.plant).toMatchObject(plantAt('bubble-berry', startTime));
    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 2, size: 'regular', fresh: true },
      { type: 'HarvestCompleted', count: 1, coins: 2, comboBonus: 0 },
      { type: 'Planted', plotId: 'plot-0', speciesId: 'bubble-berry' },
    ]);
  });

  it('clamps backward time and can harvest at the effective maturity time', () => {
    const matureAt = startTime + 8_000;
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime) }, matureAt);
    const result = step(state, [harvest('plot-0')], startTime);

    expect(result.state.lastNowMs).toBe(matureAt);
    expect(result.state.coins).toBe(state.coins + 2);
    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 2, size: 'regular', fresh: true },
      { type: 'HarvestCompleted', count: 1, coins: 2, comboBonus: 0 },
    ]);
  });

  it('does not consume RNG state when harvesting', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('twistroot', startTime - 25_000) });
    const result = step(state, [harvest('plot-0')], startTime);

    expect(result.state.rngState).toBe(state.rngState);
  });

  it('replays the same seed and command sequence to the same state and events', () => {
    const commands: readonly Command[] = [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Harvest', plotIds: ['plot-0', 'plot-1'] },
    ];
    const replay = () => {
      const initial = createInitialState(seed, startTime, { xp: 100 });
      const planted = step(initial, [commands[0]!], startTime).state;
      return step(planted, [commands[1]!], startTime + 8_000);
    };

    expect(replay()).toEqual(replay());
  });

  it('does not mutate a deeply frozen state or nested Harvest plotIds', () => {
    const mutableState = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const frozenPlots = mutableState.plots.map((plot) => Object.freeze({
      ...plot,
      plant: plot.plant === null ? null : Object.freeze({ ...plot.plant }),
    }));
    const state: GardenState = Object.freeze({ ...mutableState, plots: Object.freeze(frozenPlots) });
    const plotIds = Object.freeze(['plot-0', 'unknown-plot']);
    const command = Object.freeze({ type: 'Harvest', plotIds } as const);
    const commands: readonly Command[] = Object.freeze([command]);
    const stateBefore = JSON.stringify(state);
    const commandsBefore = JSON.stringify(commands);

    step(state, commands, startTime);

    expect(JSON.stringify(state)).toBe(stateBefore);
    expect(JSON.stringify(commands)).toBe(commandsBefore);
  });

  it('emits growth boundary events before harvest events in the same step', () => {
    const planted = step(createInitialState(seed, startTime, { xp: 100 }), [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
    ], startTime);
    const result = step(planted.state, [harvest('plot-0')], startTime + 8_000);

    expect(result.events).toEqual([
      { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Growing' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Mature' },
      { type: 'Harvestable', plotId: 'plot-0' },
      expect.objectContaining({ type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', fresh: true }),
      expect.objectContaining({ type: 'HarvestCompleted', count: 1, comboBonus: 0 }),
    ]);
  });

  it('pays fresh harvests 25% more and adds a combo bonus for several plants in one batch', () => {
    const state = stateWithPlants({
      'plot-0': plantAt('sunny-sprout', startTime - 8_000),
      'plot-1': plantAt('bubble-berry', startTime - 15_000),
      'plot-2': plantAt('twistroot', startTime - 25_000),
    });
    const result = step(state, [harvest('plot-0', 'plot-1', 'plot-2')], startTime);

    expect(result.events.filter((event) => event.type === 'HarvestCompleted')).toEqual([
      // 2 + 7 + 12 = 21 fresh; three plants add 20%: floor(4.2) = 4.
      { type: 'HarvestCompleted', count: 3, coins: 25, comboBonus: 4 },
    ]);
    expect(result.events.filter((event) => event.type === 'Harvested')).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 2, size: 'regular', fresh: true },
      { type: 'Harvested', plotId: 'plot-1', speciesId: 'bubble-berry', coins: 7, size: 'regular', fresh: true },
      { type: 'Harvested', plotId: 'plot-2', speciesId: 'twistroot', coins: 12, size: 'regular', fresh: true },
    ]);
    expect(result.state.coins).toBe(state.coins + 25);
  });

  it('emits no completion event when every target is rejected', () => {
    const state = stateWithPlants({
      'plot-0': null,
      'plot-1': plantAt('sunny-sprout', startTime - 7_999),
    });
    const result = step(state, [harvest('plot-0', 'plot-1', 'unknown')], startTime);

    expect(result.events).toEqual([
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'empty' },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-1', reason: 'not-harvestable' },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'unknown', reason: 'unknown-plot' },
    ]);
    expect(result.state.coins).toBe(state.coins);
  });

  it('pays yield size and drops the fresh bonus after the fresh window', () => {
    const state = stateWithPlants({
      'plot-0': { speciesId: 'twistroot', plantedAt: startTime - 25_000 - 5_001, size: 'big' },
      'plot-1': { speciesId: 'twistroot', plantedAt: startTime - 25_000 - 5_000, size: 'small' },
    });
    const result = step(state, [harvest('plot-0'), harvest('plot-1')], startTime);

    expect(result.events.filter((event) => event.type === 'Harvested')).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'twistroot', coins: 15, size: 'big', fresh: false },
      { type: 'Harvested', plotId: 'plot-1', speciesId: 'twistroot', coins: 10, size: 'small', fresh: true },
    ]);
  });
});
