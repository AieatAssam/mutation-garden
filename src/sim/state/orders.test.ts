import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step, type Fruit, type GardenState } from '../index';

const sunny: Fruit = { speciesId: 'sunny-sprout', size: 'regular', mutations: [], value: 2, xp: 0 };
const bubble: Fruit = { speciesId: 'bubble-berry', size: 'regular', mutations: [], value: 6, xp: 0 };
const twistroot: Fruit = { speciesId: 'twistroot', size: 'regular', mutations: [], value: 10, xp: 0 };
const giant: Fruit = { ...sunny, mutations: ['giant'] };
const withOrder = (state: GardenState, index: number, progress = 0): GardenState => ({ ...state, order: { index, progress } });

describe('fixed garden orders', () => {
  it('tracks matching sales and pays the Sunny order once', () => {
    const state = { ...withOrder(createInitialState(1, 0), 0, 1), crate: [sunny, sunny], sellingSince: 0 };
    const result = step(state, [], 2_400);
    expect(result.events.filter((event) => event.type === 'OrderCompleted')).toEqual([
      { type: 'OrderCompleted', title: 'Sell 3 Sunny Sprouts', coins: 6, xp: 10 },
    ]);
    expect(result.state).toMatchObject({ coins: state.coins + 12, xp: 10, order: { index: 1, progress: 0 } });
    expect(getSnapshot(result.state).order).toEqual({ title: 'Water 4 times', progress: 0, target: 4, rewardCoins: 4, rewardXp: 10 });
    expect(step(result.state, [], 2_400).events).not.toContainEqual(expect.objectContaining({ type: 'OrderCompleted' }));
  });

  it('shows the current bonus price and pays it before advancing the order', () => {
    const state = { ...withOrder(createInitialState(10, 0), 0), crate: [sunny], sellingSince: 0 };
    expect(getSnapshot(state).order).toMatchObject({ bonusSpeciesId: 'sunny-sprout', bonusPercent: 50 });
    const result = step(state, [], 1_200);
    expect(result.events).toContainEqual({ type: 'FruitSold', value: 3, speciesId: 'sunny-sprout', mutations: [] });
    expect(result.state.coins).toBe(state.coins + 3);
  });

  it('counts each accepted Watered event, including two waters on each of two plants', () => {
    let state = withOrder(createInitialState(2, 0), 1);
    state = step(state, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-1', seedId: 'sunny-sprout' },
    ], 0).state;
    const result = step(state, [
      { type: 'Water', plotId: 'plot-0' }, { type: 'Water', plotId: 'plot-0' },
      { type: 'Water', plotId: 'plot-1' }, { type: 'Water', plotId: 'plot-1' },
    ], 1_000);
    expect(result.events.filter((event) => event.type === 'Watered')).toHaveLength(4);
    expect(result.events).toContainEqual({ type: 'OrderCompleted', title: 'Water 4 times', coins: 4, xp: 10 });
    expect(result.state.order).toEqual({ index: 2, progress: 0 });
  });

  it('requires one batch of at least three harvested plants', () => {
    let state = withOrder(createInitialState(3, 0), 2);
    state = step(state, ['plot-0', 'plot-1', 'plot-2'].map((plotId) => ({ type: 'Plant' as const, plotId, seedId: 'sunny-sprout' as const })), 0).state;
    state = step(state, [], 8_000).state;
    const result = step(state, [{ type: 'Harvest', plotIds: ['plot-0', 'plot-1', 'plot-2'] }], 8_000);
    expect(result.events).toContainEqual({ type: 'OrderCompleted', title: 'Harvest 3 together', coins: 6, xp: 10 });
    expect(result.state.order).toEqual({ index: 4, progress: 0 });
  });

  it('matches Bubble sales, Giant fruit and Twistroot sales', () => {
    const bubbleState = { ...withOrder(createInitialState(4, 0, { xp: 500 }), 3), crate: [bubble, bubble], sellingSince: 0 };
    const bubbleResult = step(bubbleState, [], 2_400);
    expect(bubbleResult.events).toContainEqual({ type: 'OrderCompleted', title: 'Sell 2 Bubble Berries', coins: 8, xp: 12 });
    expect(bubbleResult.state.order).toEqual({ index: 4, progress: 0 });

    const giantState = { ...withOrder(createInitialState(5, 0), 4), crate: [giant], sellingSince: 0 };
    const giantResult = step(giantState, [], 1_200);
    expect(giantResult.events).toContainEqual({ type: 'OrderCompleted', title: 'Sell 1 Giant fruit', coins: 6, xp: 10 });
    expect(giantResult.state.order).toEqual({ index: 0, progress: 0 });

    const twistState = { ...withOrder(createInitialState(6, 0, { xp: 900 }), 5), crate: [twistroot, twistroot], sellingSince: 0 };
    const twistResult = step(twistState, [], 2_400);
    expect(twistResult.events).toContainEqual({ type: 'OrderCompleted', title: 'Sell 2 Twistroots', coins: 12, xp: 20 });
    expect(twistResult.state.order).toEqual({ index: 0, progress: 0 });
  });

  it('completes at most one order per step and does not count the same step again for the next one', () => {
    let state = withOrder(createInitialState(7, 0), 0, 2);
    state = { ...state, crate: [sunny, sunny, sunny], sellingSince: 0 };
    state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const result = step(state, [{ type: 'Water', plotId: 'plot-0' }], 3_600);
    expect(result.events.filter((event) => event.type === 'OrderCompleted')).toHaveLength(1);
    expect(result.events).toContainEqual({ type: 'Watered', plotId: 'plot-0' });
    expect(result.state.order).toEqual({ index: 1, progress: 0 });
  });

  it('emits the level-up caused by order XP once', () => {
    const state = { ...withOrder(createInitialState(8, 0, { xp: 490 }), 0, 2), crate: [sunny], sellingSince: 0 };
    const result = step(state, [], 1_200);
    expect(result.events.filter((event) => event.type === 'LevelUp')).toEqual([
      { type: 'LevelUp', level: 2, unlocked: ['bubble-berry'] },
    ]);
  });

  it('does not duplicate a level-up already emitted by sales in the same step', () => {
    const fruit = { ...sunny, xp: 5 };
    const state = { ...withOrder(createInitialState(9, 0, { xp: 895 }), 0, 2), crate: [fruit], sellingSince: 0 };
    const result = step(state, [], 1_200);
    expect(result.events.filter((event) => event.type === 'LevelUp')).toEqual([
      { type: 'LevelUp', level: 3, unlocked: ['twistroot'] },
    ]);
  });
});
