import { describe, expect, it } from 'vitest';
import { SPECIES } from '../content/species';
import { createInitialState, step, xpForLevel, type Command, type GardenState, type SpeciesId } from '../index';

const startTime = 10_000;
const seed = 0x12345678;

function withCoins(state: GardenState, coins: number): GardenState {
  return { ...state, coins };
}

function expectRejectedWithoutPlanting(
  state: GardenState,
  command: Command,
  reason: 'unknown-plot' | 'unknown-seed' | 'occupied' | 'insufficient-coins',
): void {
  const result = step(state, [command], startTime);

  expect(result.events).toEqual([{
    type: 'CommandRejected',
    command: 'Plant',
    plotId: command.type === 'Plant' ? command.plotId : expect.any(String),
    reason,
  }]);
  expect(result.state.coins).toBe(state.coins);
  expect(result.state.plots).toEqual(state.plots);
}

describe('Plant commands', () => {
  it.each(SPECIES)(
    'plants %s and debits its exact seed cost',
    (species) => {
      const initial = createInitialState(seed, startTime, { xp: xpForLevel(species.unlockLevel) });
      const result = step(initial, [{ type: 'Plant', plotId: 'plot-0', seedId: species.id }], startTime + 250);

      expect(result.state.coins).toBe(initial.coins - species.seedCost);
      expect(result.state.plots[0]).toMatchObject({
        id: 'plot-0',
        plant: { speciesId: species.id, plantedAt: startTime + 250 },
      });
      expect(result.events).toEqual([{ type: 'Planted', plotId: 'plot-0', speciesId: species.id }]);
    },
  );

  it('allows spending exactly the available coins', () => {
    const initial = withCoins(createInitialState(seed, startTime, { xp: 500 }), 3);
    const result = step(initial, [{ type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' }], startTime);

    expect(result.state.coins).toBe(0);
    expect(result.state.plots[0]?.plant).toMatchObject({ speciesId: 'bubble-berry', plantedAt: startTime });
    expect(result.events).toEqual([{ type: 'Planted', plotId: 'plot-0', speciesId: 'bubble-berry' }]);
  });

  it('rejects planting in an unknown plot without changing coins or plants', () => {
    const state = createInitialState(seed, startTime, { xp: 100 });
    expectRejectedWithoutPlanting(state, {
      type: 'Plant', plotId: 'plot-missing', seedId: 'sunny-sprout',
    }, 'unknown-plot');
  });

  it('rejects an invalid runtime seed without changing coins or plants', () => {
    const state = createInitialState(seed, startTime, { xp: 100 });
    const invalidSeed = 'not-a-species' as SpeciesId;
    expectRejectedWithoutPlanting(state, {
      type: 'Plant', plotId: 'plot-0', seedId: invalidSeed,
    }, 'unknown-seed');
  });

  it('rejects planting into an occupied plot without changing coins or plants', () => {
    const state = createInitialState(seed, startTime, { xp: 100 });
    const planted = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], startTime).state;
    expectRejectedWithoutPlanting(planted, {
      type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry',
    }, 'occupied');
  });

  it('rejects a seed that costs more than the available coins', () => {
    const state = withCoins(createInitialState(seed, startTime, { xp: 500 }), 2);
    expectRejectedWithoutPlanting(state, {
      type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry',
    }, 'insufficient-coins');
  });

  it('applies repeated same-plot commands in order and rejects the second planting', () => {
    const state = createInitialState(seed, startTime, { xp: 100 });
    const result = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' },
    ], startTime + 500);

    expect(result.state.coins).toBe(state.coins - 1);
    expect(result.state.plots[0]?.plant).toMatchObject({ speciesId: 'sunny-sprout', plantedAt: startTime + 500 });
    expect(result.events).toEqual([
      { type: 'Planted', plotId: 'plot-0', speciesId: 'sunny-sprout' },
      { type: 'CommandRejected', command: 'Plant', plotId: 'plot-0', reason: 'occupied' },
    ]);
  });

  it('spends commands in order, allowing later cheaper seeds after an unaffordable command', () => {
    const state = withCoins(createInitialState(seed, startTime, { xp: 900 }), 4);
    const result = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'twistroot' },
      { type: 'Plant', plotId: 'plot-2', seedId: 'sunny-sprout' },
    ], startTime);

    expect(result.state.coins).toBe(0);
    expect(result.state.plots.slice(0, 3).map(({ plant }) => plant?.speciesId ?? null)).toEqual([
      'bubble-berry', null, 'sunny-sprout',
    ]);
    expect(result.events).toEqual([
      { type: 'Planted', plotId: 'plot-0', speciesId: 'bubble-berry' },
      { type: 'CommandRejected', command: 'Plant', plotId: 'plot-1', reason: 'insufficient-coins' },
      { type: 'Planted', plotId: 'plot-2', speciesId: 'sunny-sprout' },
    ]);
  });

  it('uses the effective clock when nowMs moves backward', () => {
    const initial = createInitialState(seed, startTime, { xp: 100 });
    const result = step(initial, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], startTime - 1);

    expect(result.state.lastNowMs).toBe(startTime);
    expect(result.state.plots[0]?.plant?.plantedAt).toBe(startTime);
  });

  it('does not mutate a frozen input state or frozen commands', () => {
    const initial = createInitialState(seed, startTime, { xp: 100 });
    const plots = initial.plots.map((plot) => Object.freeze(plot));
    const frozenState: GardenState = Object.freeze({ ...initial, plots: Object.freeze(plots) });
    const command = Object.freeze({ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' } as const);
    const commands: readonly Command[] = Object.freeze([command]);
    const stateBefore = JSON.stringify(frozenState);
    const commandsBefore = JSON.stringify(commands);

    step(frozenState, commands, startTime + 1);

    expect(JSON.stringify(frozenState)).toBe(stateBefore);
    expect(JSON.stringify(commands)).toBe(commandsBefore);
  });

  it('replays the same seed and commands to the same state and events', () => {
    const commands: readonly Command[] = [
      { type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
    ];
    const first = step(createInitialState(seed, startTime, { xp: 100 }), commands, startTime + 250);
    const replay = step(createInitialState(seed, startTime, { xp: 100 }), commands, startTime + 250);

    expect(replay).toEqual(first);
  });
});
