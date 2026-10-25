import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from './index';

describe('manual economy pacing', () => {
  it('keeps a one-plot Bubble Berry loop near twelve net coins per minute', () => {
    const rewardsPaid = ['giant', 'golden', 'glowing', 'crystal', 'rainbow'].map((trait) => `bubble-berry:${trait}`);
    const coinsPerMinute = [1, 2, 3, 4, 5].reduce((total, seed) => {
      const initial = createInitialState(seed, 0, { xp: 500 });
      let state: ReturnType<typeof createInitialState> = { ...initial, plantCount: 100, rewardsPaid, scriptedGiantUsed: true, scriptedGoldenUsed: true };
      for (let tick = 1; tick <= 10 * 60; tick += 1) {
        const nowMs = tick * 1_000;
        state = step(state, [], nowMs).state;
        const plot = getSnapshot(state).plots.find(({ id }) => id === 'plot-0')!;
        const commands: Parameters<typeof step>[1][number][] = [];
        if (state.crate.length && state.sellingSince === null) commands.push({ type: 'StartSelling' });
        if (plot.plant?.stage === 'Harvestable') commands.push({ type: 'Harvest', plotIds: [plot.id] });
        if (!plot.plant && state.coins >= 4) commands.push({ type: 'Plant', plotId: plot.id, seedId: 'bubble-berry' });
        state = step(state, commands, nowMs).state;
      }
      return total + (state.coins - initial.coins) / 10;
    }, 0) / 5;

    expect(coinsPerMinute).toBeGreaterThanOrEqual(9);
    expect(coinsPerMinute).toBeLessThanOrEqual(15);
  });
});
