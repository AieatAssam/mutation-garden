import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  getSnapshot,
  SPECIES,
  xpForLevel,
  step,
  type Command,
  type GardenState,
} from '../index';

const seed = 0x1234_5678;

function plantOne(speciesId: (typeof SPECIES)[number]['id'], plotId = 'plot-0') {
  const species = SPECIES.find(({ id }) => id === speciesId)!;
  const initial = { ...createInitialState(seed, 0, { xp: xpForLevel(species.unlockLevel) }), coins: species.seedCost, plantCount: 2,
    labSeeds: speciesId === 'prism-fig' || speciesId === 'sunburst' ? [speciesId] : [] };
  const command: Command = { type: 'Plant', plotId, seedId: speciesId };
  const planted = step(initial, [command], 0);
  return { state: planted.state, plantedAt: 0 };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

describe('timestamp-derived plant growth', () => {
  it.each(SPECIES.flatMap((species) =>
    species.stages.slice(1).map(({ stage, startsAtMs }, index) => ({
      species,
      stage,
      startsAtMs,
      previousStage: species.stages[index]?.stage,
    })),
  ))('$species.name reaches $stage immediately at its boundary', ({
    species,
    stage,
    startsAtMs,
    previousStage,
  }) => {
    const { state } = plantOne(species.id);
    const before = step(state, [], startsAtMs - 1);
    const at = step(before.state, [], startsAtMs);
    const after = step(at.state, [], startsAtMs + 1);

    expect(getSnapshot(before.state).plots[0]?.plant).toMatchObject({
      stage: previousStage,
      progress: (startsAtMs - 1) / species.growthDurationMs,
    });
    expect(at.events.slice(0, 1)).toEqual([
      stage === 'Harvestable'
        ? { type: 'Harvestable', plotId: 'plot-0' }
        : { type: 'StageReached', plotId: 'plot-0', stage },
    ]);
    if (stage === 'Mature') expect(at.events.at(-1)).toEqual({ type: 'StageReached', plotId: 'plot-0', stage: 'Mature' });
    expect(getSnapshot(at.state).plots[0]?.plant).toMatchObject({
      stage,
      progress: startsAtMs / species.growthDurationMs,
    });
    expect(after.events).toEqual([]);
    expect(getSnapshot(after.state).plots[0]?.plant).toMatchObject({
      stage,
      progress: Math.min(1, (startsAtMs + 1) / species.growthDurationMs),
    });
  });

  it('emits every crossed stage in plot order and then species table order on a long jump', () => {
    const initial = createInitialState(seed, 0, { xp: 2_500 });
    const commands: Command[] = [
      { type: 'Plant', plotId: 'plot-2', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
    ];
    const planted = step(initial, commands, 0);
    const grown = step(planted.state, [], 30_000);
    const expected = [
      ['plot-0', 'bubble-berry'],
      ['plot-1', 'sunny-sprout'],
      ['plot-2', 'twistroot'],
    ].flatMap(([plotId, speciesId]) => {
      const species = SPECIES.find((entry) => entry.id === speciesId)!;
      return species.stages.slice(1).map(({ stage }) =>
        stage === 'Harvestable'
          ? { type: 'Harvestable', plotId }
          : { type: 'StageReached', plotId, stage },
      );
    });

    expect(grown.events.slice(0, expected.length)).toEqual(expected);
    expect(grown.events.slice(expected.length).every((event) => event.type === 'Mutated')).toBe(true);
  });

  it('emits existing-plant growth events before successful and rejected plant command events', () => {
    const planted = step(createInitialState(seed, 0, { xp: 500 }), [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
    ], 0).state;
    const result = step(planted, [
      { type: 'Plant', plotId: 'plot-1', seedId: 'bubble-berry' },
      { type: 'Plant', plotId: 'missing-plot', seedId: 'sunny-sprout' },
    ], 8_000);

    expect(result.events).toEqual([
      { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Growing' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Mature' },
      { type: 'Harvestable', plotId: 'plot-0' },
      { type: 'Planted', plotId: 'plot-1', speciesId: 'bubble-berry' },
      {
        type: 'CommandRejected',
        command: 'Plant',
        plotId: 'missing-plot',
        reason: 'unknown-plot',
      },
    ]);
  });

  it('keeps six stable initial plots in snapshots and exposes only derived growth there', () => {
    const initial = createInitialState(seed, 100, { xp: 500 });
    expect(getSnapshot(initial)).toEqual({
      coins: initial.coins,
      bonusSeeds: 0,
      xp: 500,
      level: 2,
      levelStartXp: 500,
      nextLevelXp: 900,
      nowMs: 100,
      plantCount: 0,
      owned: [],
      fertiliser: 0,
      crate: [],
      labSpecimens: [],
      labSeeds: [],
      crateCount: 0,
      crateCapacity: 12,
      saleIntervalMs: 1_200,
      discoveries: [],
      rewardsPaid: [],
      order: { title: 'Sell 3 Sunny Sprouts', progress: 0, target: 3, rewardCoins: 6, rewardXp: 10, bonusSpeciesId: 'sunny-sprout', bonusPercent: 50 },
      mutationProgress: [],
      selling: false,
      nextSaleTime: null,
      scriptedGiantUsed: false,
      scriptedGoldenUsed: false,
      nearMiss: null,
      plots: Array.from({ length: 6 }, (_, index) => ({ id: `plot-${index}`, plant: null })),
    });

    const planted = step(initial, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 100);
    expect(getSnapshot(planted.state).plots.map(({ id }) => id)).toEqual(
      Array.from({ length: 6 }, (_, index) => `plot-${index}`),
    );
    expect(getSnapshot(planted.state).plots[0]?.plant).toMatchObject({
      speciesId: 'sunny-sprout',
      plantedAt: 100,
      stage: 'Seed',
      progress: 0,
    });
    expect(Object.keys(planted.state)).toEqual(['schema', 'coins', 'bonusSeeds', 'lastNowMs', 'rngState', 'mutationRngState', 'scriptedGiantUsed', 'scriptedGoldenUsed', 'plantCount', 'badLuck', 'discoveries', 'rewardsPaid', 'crystalReadyPlots', 'rainbowPlots', 'owned', 'fertiliser', 'xp', 'crate', 'labSpecimens', 'labSeeds', 'nextLabSpecimenId', 'sellingSince', 'order', 'plots']);
    expect(Object.keys(planted.state.plots[0]!.plant!)).toEqual(['speciesId', 'plantedAt', 'size', 'mutationSeed', 'waterCount']);

    const half = step(planted.state, [], 4_100);
    expect(getSnapshot(half.state).plots[0]?.plant).toMatchObject({ stage: 'Growing', progress: 0.5 });
    const beyondRipe = step(half.state, [], 8_100);
    expect(getSnapshot(beyondRipe.state).plots[0]?.plant).toMatchObject({
      stage: 'Harvestable',
      progress: 1,
    });
  });

  it('copies snapshot arrays, plot records, and plant records from a frozen source state', () => {
    const planted = step(createInitialState(seed, 100, { xp: 450 }), [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
    ], 500).state;
    const frozenState = freezeDeep(planted) as GardenState;
    const before = JSON.stringify(frozenState);

    const snapshot = getSnapshot(frozenState);

    expect(snapshot.plots).not.toBe(frozenState.plots);
    for (const [index, snapshotPlot] of snapshot.plots.entries()) {
      expect(snapshotPlot).not.toBe(frozenState.plots[index]);
    }
    expect(snapshot.plots[0]?.plant).not.toBe(frozenState.plots[0]?.plant);
    expect(Object.isFrozen(frozenState)).toBe(true);
    expect(Object.isFrozen(frozenState.plots)).toBe(true);
    expect(JSON.stringify(frozenState)).toBe(before);
  });

  it('does not emit historical growth events for a plant created in the current step', () => {
    const initial = createInitialState(seed, 0, { xp: 100 });
    const result = step(initial, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
    ], 100_000);

    expect(result.events).toEqual([
      { type: 'Planted', plotId: 'plot-0', speciesId: 'sunny-sprout' },
    ]);
    expect(result.state.plots[0]?.plant?.plantedAt).toBe(100_000);
    expect(getSnapshot(result.state).plots[0]?.plant).toMatchObject({ stage: 'Seed', progress: 0 });
  });

  it('does not repeat events at the same time, regress on backward time, or remove a ripe plant', () => {
    const { state } = plantOne('sunny-sprout');
    const atSprout = step(state, [], 1_000);
    const repeated = step(atSprout.state, [], 1_000);
    const backward = step(repeated.state, [], 500);
    expect(atSprout.events).toEqual([
      { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' },
    ]);
    expect(repeated.events).toEqual([]);
    expect(backward.events).toEqual([]);
    expect(backward.state.lastNowMs).toBe(1_000);
    expect(getSnapshot(backward.state).plots[0]?.plant).toMatchObject({
      stage: 'Sprout',
      progress: 1_000 / 8_000,
    });

    const ripe = step(state, [], 8_000);
    const muchLater = step(ripe.state, [], Number.MAX_SAFE_INTEGER);
    expect(muchLater.events).toEqual([]);
    expect(muchLater.state.plots[0]?.plant).toEqual(ripe.state.plots[0]?.plant);
    expect(getSnapshot(muchLater.state).plots[0]?.plant).toMatchObject({
      stage: 'Harvestable',
      progress: 1,
    });
  });

  it('reaches the same final state and snapshot with one large step or many small steps', () => {
    const initial = createInitialState(seed, 0, { xp: 100 });
    const planted = step(initial, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'bubble-berry' },
      { type: 'Plant', plotId: 'plot-2', seedId: 'twistroot' },
    ], 0).state;
    const oneStep = step(planted, [], 30_000).state;
    let manySteps = planted;
    for (let nowMs = 137; nowMs < 30_000; nowMs += 137) {
      manySteps = step(manySteps, [], nowMs).state;
    }
    manySteps = step(manySteps, [], 30_000).state;

    expect(manySteps).toEqual(oneStep);
    expect(getSnapshot(manySteps)).toEqual(getSnapshot(oneStep));
  });

  it('replays deterministically without mutating frozen nested state or commands', () => {
    const initial = createInitialState(seed, 0, { xp: 100 });
    const planted = step(initial, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const frozenState = freezeDeep(planted) as GardenState;
    const commands = freezeDeep([
      { type: 'Plant', plotId: 'plot-1', seedId: 'bubble-berry' },
    ] as const satisfies readonly Command[]);
    const before = JSON.stringify({ state: frozenState, commands });

    const first = step(frozenState, commands, 4_500);
    const second = step(frozenState, commands, 4_500);

    expect(first).toEqual(second);
    expect(JSON.stringify({ state: frozenState, commands })).toBe(before);
  });

  it('does not change coins or RNG state as plants grow', () => {
    const planted = step(createInitialState(seed, 0, { xp: 100 }), [
      { type: 'Plant', plotId: 'plot-0', seedId: 'twistroot' },
    ], 0).state;
    const grown = step(planted, [], 30_000).state;

    expect(grown.coins).toBe(planted.coins);
    expect(grown.rngState).toBe(planted.rngState);
  });
});
