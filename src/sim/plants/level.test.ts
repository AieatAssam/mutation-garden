import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, levelForXp, step, xpForLevel } from '../index';

describe('garden levels', () => {
  it('maps XP to levels from the table, then +200 per level', () => {
    expect([0, 499, 500, 899, 900, 10_300, 10_499, 10_500].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 9, 9, 10]);
    expect(xpForLevel(2)).toBe(500);
    expect(xpForLevel(11)).toBe(10_700);
  });

  it('locks seeds until their level and unlocks them with a LevelUp event', () => {
    const start = createInitialState(5, 0);
    expect(step(start, [{ type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' }], 0).events)
      .toEqual([{ type: 'CommandRejected', command: 'Plant', plotId: 'plot-0', reason: 'locked' }]);

    // A Sunny sale fills the final 2 XP and unlocks Bubble Berry.
    let state = { ...start, xp: 498, plantCount: 100 };
    for (let round = 0; round < 1; round += 1) {
      const t = round * 10_000;
      state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], t).state;
      state = { ...state, plots: state.plots.map((plot) => plot.id === 'plot-0' && plot.plant
        ? { ...plot, plant: { ...plot.plant, mutationSeed: 0xffff_ffff } } : plot) };
      const result = step(state, [{ type: 'Harvest', plotIds: ['plot-0'] }], t + 8_000);
      const started = step(result.state, [{ type: 'StartSelling' }], t + 8_000).state;
      const sold = step(started, [], t + 9_200);
      state = sold.state;
      const levelUps = [...result.events, ...sold.events].filter((event) => event.type === 'LevelUp');
      expect(levelUps).toEqual([{ type: 'LevelUp', level: 2, unlocked: ['bubble-berry'] }]);
    }
    expect(getSnapshot(state)).toMatchObject({ xp: 500, level: 2, levelStartXp: 500, nextLevelXp: 900 });
    expect(step(state, [{ type: 'Plant', plotId: 'plot-1', seedId: 'bubble-berry' }], 40_000).events)
      .toEqual([{ type: 'Planted', plotId: 'plot-1', speciesId: 'bubble-berry' }]);
  });
});
