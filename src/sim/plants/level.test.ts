import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, levelForXp, step, xpForLevel } from '../index';

describe('garden levels', () => {
  it('maps XP to levels from the table, then +200 per level', () => {
    expect([0, 5, 6, 15, 16, 360, 559, 560].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 9, 9, 10]);
    expect(xpForLevel(2)).toBe(6);
    expect(xpForLevel(11)).toBe(760);
  });

  it('locks seeds until their level and unlocks them with a LevelUp event', () => {
    const start = createInitialState(5, 0);
    expect(step(start, [{ type: 'Plant', plotId: 'plot-0', seedId: 'bubble-berry' }], 0).events)
      .toEqual([{ type: 'CommandRejected', command: 'Plant', plotId: 'plot-0', reason: 'locked' }]);

    // Three Sunny Sprouts (2 XP each) reach level 2 and unlock Bubble Berry.
    let state = start;
    state = { ...state, plantCount: 100 };
    for (let round = 0; round < 3; round += 1) {
      const t = round * 10_000;
      state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], t).state;
      state = { ...state, plots: state.plots.map((plot) => plot.id === 'plot-0' && plot.plant
        ? { ...plot, plant: { ...plot.plant, mutationSeed: 0xffff_ffff } } : plot) };
      const result = step(state, [{ type: 'Harvest', plotIds: ['plot-0'] }], t + 8_000);
      state = result.state;
      const levelUps = result.events.filter((event) => event.type === 'LevelUp');
      if (round === 2) expect(levelUps).toEqual([{ type: 'LevelUp', level: 2, unlocked: ['bubble-berry'] }]);
      else expect(levelUps.every((event) => event.level === 2)).toBe(true);
    }
    expect(getSnapshot(state)).toMatchObject({ xp: 6, level: 2, levelStartXp: 6, nextLevelXp: 16 });
    expect(step(state, [{ type: 'Plant', plotId: 'plot-1', seedId: 'bubble-berry' }], 40_000).events)
      .toEqual([{ type: 'Planted', plotId: 'plot-1', speciesId: 'bubble-berry' }]);
  });
});
