import { describe, expect, it } from 'vitest';
import { createInitialState, step, type GardenState } from '../index';

const seed = 0x12345678;
const startTime = 10_000;

function freezeState(state: GardenState): GardenState {
  for (const plot of state.plots) Object.freeze(plot);
  Object.freeze(state.plots);
  return Object.freeze(state);
}

describe('initial garden state', () => {
    it('creates a JSON-safe schema 4 state with six stable empty plots', () => {
    const state = createInitialState(seed, startTime);

    expect(state).toEqual({
      schema: 4,
      coins: expect.any(Number),
      lastNowMs: startTime,
      rngState: expect.any(Number),
      mutationRngState: expect.any(Number),
      scriptedGiantUsed: false,
      scriptedGoldenUsed: false,
      plantCount: 0,
      badLuck: { giant: 0, golden: 0, glowing: 0, crystal: 0, rainbow: 0 },
      discoveries: [],
      rewardsPaid: [],
      owned: [],
      fertiliser: 0,
      xp: 0,
      crate: [],
      sellingSince: null,
      plots: [
        { id: 'plot-0', plant: null },
        { id: 'plot-1', plant: null },
        { id: 'plot-2', plant: null },
        { id: 'plot-3', plant: null },
        { id: 'plot-4', plant: null },
        { id: 'plot-5', plant: null },
      ],
    });
    expect(Number.isSafeInteger(state.coins)).toBe(true);
    expect(Number.isInteger(state.rngState)).toBe(true);
    expect(state.rngState).toBeGreaterThanOrEqual(0);
    expect(state.rngState).toBeLessThan(2 ** 32);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid initial timestamps (%s)',
    (nowMs) => {
      expect(() => createInitialState(seed, nowMs)).toThrow();
    },
  );

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid integer seeds (%s)',
    (invalidSeed) => {
      expect(() => createInitialState(invalidSeed, startTime)).toThrow();
    },
  );

  it('normalizes a signed integer seed to an unsigned RNG state', () => {
    expect(createInitialState(-1, startTime).rngState).toBe(0xffff_ffff);
  });
});

describe('empty-command state progression', () => {
  it('replays the same seed and timestamps to the same state and events', () => {
    const first = step(createInitialState(seed, startTime), [], startTime + 1_000);
    const second = step(createInitialState(seed, startTime), [], startTime + 1_000);

    expect(first).toEqual(second);
    expect(first.state.lastNowMs).toBe(startTime + 1_000);
    expect(first.events).toEqual([]);
  });

  it('does not mutate a frozen input state or command list', () => {
    const state = freezeState(createInitialState(seed, startTime));
    const commands = Object.freeze([]);
    const beforeState = JSON.stringify(state);

    step(state, commands, startTime + 1_000);

    expect(JSON.stringify(state)).toBe(beforeState);
    expect(commands).toEqual([]);
  });

  it('clamps valid backward timestamps and never decreases lastNowMs', () => {
    const advanced = step(createInitialState(seed, startTime), [], startTime + 1_000);
    const backward = step(advanced.state, [], startTime + 500);

    expect(backward.state.lastNowMs).toBe(advanced.state.lastNowMs);
    expect(backward.events).toEqual([]);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid step timestamps (%s)',
    (nowMs) => {
      expect(() => step(createInitialState(seed, startTime), [], nowMs)).toThrow();
    },
  );

  it('reaches the same state when elapsed time is split across different step sizes', () => {
    const initial = createInitialState(seed, startTime);
    const oneStep = step(initial, [], startTime + 1_000).state;
    let manySteps = initial;
    for (let time = startTime + 100; time <= startTime + 1_000; time += 100) {
      manySteps = step(manySteps, [], time).state;
    }

    expect(manySteps).toEqual(oneStep);
  });

  it('continues deterministically after a JSON save roundtrip', () => {
    const advanced = step(createInitialState(seed, startTime), [], startTime + 500).state;
    const restored = JSON.parse(JSON.stringify(advanced)) as GardenState;

    expect(step(restored, [], startTime + 1_000)).toEqual(
      step(advanced, [], startTime + 1_000),
    );
  });
});
