import { describe, expect, it } from 'vitest';
import { SPECIES } from '../content/species';
import { createInitialState, getSnapshot, step, type Command, type GardenState, type PlantState, type SpeciesId } from '../index';

const seed = 0x12345678;
const startTime = 10_000;

function stateWithPlants(
  plants: Readonly<Record<string, PlantState | null>>,
  nowMs = startTime,
): GardenState {
  const initial = createInitialState(seed, nowMs, { xp: 5_000 });
  return {
    ...initial,
    rngState: 2,
    lastNowMs: nowMs,
    plots: initial.plots.map((plot) => ({
      ...plot,
      plant: Object.hasOwn(plants, plot.id) ? plants[plot.id] ?? null : null,
    })),
  };
}

function plantAt(speciesId: SpeciesId, plantedAt: number) {
  return { speciesId, plantedAt, mutationSeed: 0xffff_ffff };
}

function harvest(...plotIds: string[]): Command {
  return { type: 'Harvest', plotIds };
}

describe('Harvest commands', () => {
  it.each([
    ['just before dusk', 18 * 60 * 60_000 - 1, false],
    ['dusk begins', 18 * 60 * 60_000, true],
    ['dusk ends', 20 * 60 * 60_000, false],
  ])('awards the Lantern Pod seed %s', (_label, utcTime, expected) => {
    const plantedAt = 86_400_000 + utcTime - SPECIES.find((entry) => entry.id === 'lantern-pod')!.growthDurationMs;
    const state = stateWithPlants({ 'plot-0': plantAt('lantern-pod', plantedAt) }, plantedAt);
    const result = step(state, [harvest('plot-0')], plantedAt + 45_000);
    expect(result.state.bonusSeeds).toBe(expected ? 1 : 0);
    const harvested = result.events.find((event) => event.type === 'Harvested');
    expect(harvested?.type === 'Harvested' && harvested.bonusSeed === true).toBe(expected);
  });

  it('spends a Lantern Pod dusk seed without coins, while paid planting still costs coins', () => {
    const initial = createInitialState(seed, startTime, { xp: 5_000 });
    const freeState = { ...initial, bonusSeeds: 1 };
    const free = step(freeState, [{ type: 'Plant', plotId: 'plot-0', seedId: 'lantern-pod' }], startTime);
    expect(free.state.bonusSeeds).toBe(0);
    expect(free.state.coins).toBe(freeState.coins);
    const paid = step(initial, [{ type: 'Plant', plotId: 'plot-0', seedId: 'lantern-pod' }], startTime);
    expect(paid.state.coins).toBe(initial.coins - 12);
  });

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
      expect(beforeMaturity.state.plots[0]?.plant).toEqual({ ...plantAt(species.id, plantedAt), mutations: [] });
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
      expect(atMaturity.state.coins).toBe(beforeMaturity.state.coins);
      expect(atMaturity.state.crate).toContainEqual(expect.objectContaining({ speciesId: species.id, value: paid }));
      expect(atMaturity.state.plots[0]?.plant).toBeNull();
      expect(atMaturity.events).toEqual([
        { type: 'Harvestable', plotId: 'plot-0' },
        { type: 'Harvested', plotId: 'plot-0', speciesId: species.id, coins: 0, size: 'regular', fresh: true, lucky: false },
        { type: 'HarvestCompleted', count: 1, coins: 0, comboBonus: 0 },
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
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'missing-plot', reason: 'unknown-plot' },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-1', reason: 'empty' },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-2', reason: 'not-harvestable' },
      { type: 'HarvestCompleted', count: 1, coins: 0, comboBonus: 0 },
    ]);
    expect(result.state.coins).toBe(state.coins);
    expect(result.state.plots.map(({ plant }) => plant)).toEqual([
      null,
      null,
      { ...plantAt('bubble-berry', startTime - 14_999), mutations: [] },
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
      { type: 'Harvested', plotId: 'plot-1', speciesId: 'bubble-berry', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'bad-plot', reason: 'unknown-plot' },
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'HarvestCompleted', count: 2, coins: 0, comboBonus: 0 },
    ]);
    expect(result.state.coins).toBe(state.coins);
    expect(result.state.plots.slice(0, 2).map(({ plant }) => plant)).toEqual([null, null]);
  });

  it('accepts an empty batch without events or state changes', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const result = step(state, [harvest()], startTime);

    expect(result.events).toEqual([]);
    expect(result.state.plots[0]?.plant).toMatchObject({ mutations: [] });
  });

  it('pays once when duplicate Harvest commands target the same plot in one step', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const result = step(state, [harvest('plot-0'), harvest('plot-0')], startTime);

    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'HarvestCompleted', count: 1, coins: 0, comboBonus: 0 },
      { type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'empty' },
    ]);
    expect(result.state.coins).toBe(state.coins);
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

    expect(result.state.coins).toBe(state.coins - 5);
    expect(result.state.plots[0]?.plant).toMatchObject({ speciesId: 'bubble-berry', plantedAt: startTime });
    expect(result.state.plots[0]?.plant?.mutationSeed).toEqual(expect.any(Number));
    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'HarvestCompleted', count: 1, coins: 0, comboBonus: 0 },
      { type: 'Planted', plotId: 'plot-0', speciesId: 'bubble-berry' },
    ]);
  });

  it('clamps backward time and can harvest at the effective maturity time', () => {
    const matureAt = startTime + 8_000;
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime) }, matureAt);
    const result = step(state, [harvest('plot-0')], startTime);

    expect(result.state.lastNowMs).toBe(matureAt);
    expect(result.state.coins).toBe(state.coins);
    expect(result.events).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'HarvestCompleted', count: 1, coins: 0, comboBonus: 0 },
    ]);
  });



  it('multiplies mutated coin and XP value by every stored trait', () => {
    const initial = createInitialState(seed, startTime);
    const rngState = 0xffff_ffff;
    const state: GardenState = { ...initial, rngState, rewardsPaid: ['sunny-sprout:giant', 'sunny-sprout:golden'], plots: initial.plots.map((plot) => plot.id === 'plot-0'
      ? { ...plot, plant: { speciesId: 'sunny-sprout', plantedAt: startTime - 8_000, size: 'regular', mutationSeed: 0, mutations: ['golden', 'giant'] } }
      : plot) };
    const result = step(state, [harvest('plot-0')], startTime);
    expect(result.state.coins).toBe(state.coins);
    expect(result.state.xp).toBe(state.xp);
    expect(result.state.crate[0]).toMatchObject({ value: 20, xp: 16, mutations: ['golden', 'giant'] });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'Harvested', coins: 0, mutations: ['golden', 'giant'] }));
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

  it('stores fresh-adjusted values for each harvested fruit', () => {
    const state = stateWithPlants({
      'plot-0': plantAt('sunny-sprout', startTime - 8_000),
      'plot-1': plantAt('bubble-berry', startTime - 15_000),
      'plot-2': plantAt('twistroot', startTime - 25_000),
    });
    const result = step(state, [harvest('plot-0', 'plot-1', 'plot-2')], startTime);

    expect(result.events.filter((event) => event.type === 'HarvestCompleted')).toEqual([
      { type: 'HarvestCompleted', count: 3, coins: 0, comboBonus: 0 },
    ]);
    expect(result.events.filter((event) => event.type === 'Harvested')).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'Harvested', plotId: 'plot-1', speciesId: 'bubble-berry', coins: 0, size: 'regular', fresh: true, lucky: false },
      { type: 'Harvested', plotId: 'plot-2', speciesId: 'twistroot', coins: 0, size: 'regular', fresh: true, lucky: false },
    ]);
    expect(result.state.coins).toBe(state.coins);
    expect(result.state.crate.map(({ value }) => value)).toEqual([2, 7, 12]);
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

  it('rejects harvest at capacity without losing ripe fruit', () => {
    const state = stateWithPlants({ 'plot-0': plantAt('sunny-sprout', startTime - 8_000) });
    const crate = Array.from({ length: 12 }, () => ({ speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 2, xp: 2 }));
    const result = step({ ...state, crate }, [harvest('plot-0')], startTime);
    expect(result.state.crate).toHaveLength(12);
    expect(result.state.plots[0]?.plant).not.toBeNull();
    expect(result.events).toContainEqual({ type: 'CommandRejected', command: 'Harvest', plotId: 'plot-0', reason: 'crate-full' });
  });

  it('flags only successfully harvested mutation plots for Rainbow', () => {
    const state = stateWithPlants({
      'plot-0': { ...plantAt('sunny-sprout', startTime - 8_000), mutations: ['golden'] },
      'plot-1': { ...plantAt('sunny-sprout', startTime - 8_000), mutations: ['glowing'] },
      'plot-2': { ...plantAt('sunny-sprout', startTime - 8_000), mutations: ['crystal'] },
      'plot-3': { ...plantAt('sunny-sprout', startTime - 8_000), mutations: ['glowing'] },
    });
    const crate = Array.from({ length: 9 }, () => ({ speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 2, xp: 2 }));

    const result = step({ ...state, crate }, [harvest('plot-0', 'plot-1', 'plot-2', 'plot-3')], startTime);

    expect(result.state.rainbowPlots).toEqual(['plot-0', 'plot-1', 'plot-2']);
    expect(result.events).toContainEqual({ type: 'CommandRejected', command: 'Harvest', plotId: 'plot-3', reason: 'crate-full' });
  });

  it('sells one fruit per 1.2 seconds with identical offline totals', () => {
    const fruit = { speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: ['golden' as const], value: 7, xp: 6 };
    const queued = { ...createInitialState(seed, startTime), crate: [fruit, { ...fruit, mutations: [], value: 2, xp: 2 }] };
    const started = step(queued, [{ type: 'StartSelling' }], startTime).state;
    expect(getSnapshot(started)).toMatchObject({ crateCount: 2, crateCapacity: 12, selling: true, nextSaleTime: startTime + 1_200 });
    const whole = step(started, [], startTime + 2_400);
    const split = step(step(started, [], startTime + 1_301).state, [], startTime + 2_400);
    expect(whole.state.coins).toBe(started.coins + 13);
    expect(whole.state.xp).toBe(started.xp + 8);
    expect(whole.state.crate).toEqual([]);
    expect(whole.events.filter((event) => event.type === 'FruitSold')).toEqual([
      { type: 'FruitSold', value: 10, speciesId: 'sunny-sprout', mutations: ['golden'] },
      { type: 'FruitSold', value: 3, speciesId: 'sunny-sprout', mutations: [] },
    ]);
    expect(split.state.coins).toBe(whole.state.coins);
    expect(split.state.xp).toBe(whole.state.xp);
  });

  it('stores yield size and drops the fresh bonus after the fresh window', () => {
    const state = stateWithPlants({
      'plot-0': { speciesId: 'twistroot', plantedAt: startTime - 25_000 - 5_001, size: 'big', mutationSeed: 0xffff_ffff },
      'plot-1': { speciesId: 'twistroot', plantedAt: startTime - 25_000 - 5_000, size: 'small', mutationSeed: 0xffff_ffff },
    });
    const result = step(state, [harvest('plot-0'), harvest('plot-1')], startTime);

    expect(result.events.filter((event) => event.type === 'Harvested')).toEqual([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'twistroot', coins: 0, size: 'big', fresh: false, lucky: false },
      { type: 'Harvested', plotId: 'plot-1', speciesId: 'twistroot', coins: 0, size: 'small', fresh: true, lucky: false },
    ]);
  });
});
