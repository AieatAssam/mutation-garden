import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step, type GardenState } from '../index';

const start = 10_000;
const planted = (): GardenState =>
  step(createInitialState(7, start), [{ type: 'Plant', plotId: 'plot-0', seedId: 'twistroot' }], start).state;

describe('Water commands', () => {
  it('cuts the remaining growth time by 30% once', () => {
    const watered = step(planted(), [{ type: 'Water', plotId: 'plot-0' }], start + 5_000);
    // 20 s remained; 6 s are skipped, so it ripens at 19 s instead of 25 s (and jumps into Growing).
    expect(watered.events).toEqual([
      { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' },
      { type: 'Watered', plotId: 'plot-0' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Growing' },
    ]);
    expect(watered.state.plots[0]?.plant).toMatchObject({ plantedAt: start - 6_000, watered: true });
    expect(getSnapshot(step(watered.state, [], start + 18_999).state).plots[0]?.plant?.stage).toBe('Mature');
    expect(getSnapshot(step(watered.state, [], start + 19_000).state).plots[0]?.plant?.stage).toBe('Harvestable');

    const again = step(watered.state, [{ type: 'Water', plotId: 'plot-0' }], start + 6_000);
    expect(again.events).toEqual([{ type: 'CommandRejected', command: 'Water', plotId: 'plot-0', reason: 'already-watered' }]);
    expect(again.state.plots).toBe(watered.state.plots);
  });

  it('emits stages the jump crosses so presentation never misses one', () => {
    // At 9.9 s Twistroot is Sprout; skipping 4.53 s lands past Growing (10 s).
    const result = step(planted(), [{ type: 'Water', plotId: 'plot-0' }], start + 9_900);
    expect(result.events).toEqual([
      { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' },
      { type: 'Watered', plotId: 'plot-0' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Growing' },
    ]);
  });

  it('rejects empty, unknown and ripe plots without changing state', () => {
    const state = planted();
    const ripe = step(state, [], start + 25_000).state;
    for (const [target, from, reason] of [
      ['plot-1', state, 'empty'], ['nope', state, 'unknown-plot'], ['plot-0', ripe, 'not-growing'],
    ] as const) {
      const result = step(from, [{ type: 'Water', plotId: target }], from.lastNowMs);
      expect(result.events).toEqual([{ type: 'CommandRejected', command: 'Water', plotId: target, reason }]);
      expect(result.state.plots).toBe(from.plots);
    }
  });
});

describe('Yield size', () => {
  it('rolls from the seeded RNG at planting and replays exactly', () => {
    const sizes = (seed: number) => {
      let state = createInitialState(seed, 0);
      const out: string[] = [];
      for (let index = 0; index < 40; index += 1) {
        state = { ...state, coins: 100, plots: state.plots.map((plot) => ({ ...plot, plant: null })) };
        const result = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0);
        out.push(result.state.plots[0]!.plant!.size!);
        expect(result.state.rngState).not.toBe(state.rngState);
        state = result.state;
      }
      return out;
    };
    const first = sizes(3);
    expect(sizes(3)).toEqual(first);
    expect(new Set(first)).toEqual(new Set(['small', 'regular', 'big']));
  });
});
