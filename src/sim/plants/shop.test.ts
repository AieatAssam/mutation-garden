import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, SHOP_PRICES, step } from '../index';

describe('shop purchases', () => {
  it('validates level, price, ownership and adds plots only after payment', () => {
    const locked = step(createInitialState(1, 0), [{ type: 'Buy', item: 'plot-6' }], 0);
    expect(locked.events).toContainEqual(expect.objectContaining({ reason: 'locked' }));
    const poor = step({ ...createInitialState(1, 0, { xp: 900 }), coins: SHOP_PRICES['plot-6'] - 1 }, [{ type: 'Buy', item: 'plot-6' }], 0);
    expect(poor.events).toContainEqual(expect.objectContaining({ reason: 'insufficient-coins' }));
    const bought = step({ ...poor.state, coins: SHOP_PRICES['plot-6'] }, [{ type: 'Buy', item: 'plot-6' }], 0);
    expect(bought.state.coins).toBe(0);
    expect(bought.state.plots.at(-1)).toEqual({ id: 'plot-6', plant: null });
    expect(step(bought.state, [{ type: 'Buy', item: 'plot-6' }], 0).events).toContainEqual(expect.objectContaining({ reason: 'owned' }));
  });

  it('consumes fertiliser on the next seed and applies a 40% time reduction', () => {
    let state = { ...createInitialState(2, 0), coins: SHOP_PRICES.fertiliser + 1 };
    state = step(state, [{ type: 'Buy', item: 'fertiliser' }], 0).state;
    expect(state.fertiliser).toBe(1);
    state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    expect(state.fertiliser).toBe(0);
    expect(state.plots[0]?.plant).toMatchObject({ fertilised: true, boostMs: 3_200, waterCount: 0 });
  });

  it('requires the first plot before buying the second and waters all plants with Big can', () => {
    let state = { ...createInitialState(3, 0, { xp: 2_500 }), coins: SHOP_PRICES['plot-6'] + SHOP_PRICES['plot-7'] + SHOP_PRICES['big-can'] + 1 };
    expect(step(state, [{ type: 'Buy', item: 'plot-7' }], 0).events).toContainEqual(expect.objectContaining({ reason: 'locked' }));
    state = step(state, [{ type: 'Buy', item: 'plot-6' }, { type: 'Buy', item: 'plot-7' }, { type: 'Buy', item: 'big-can' }], 0).state;
    expect(state.plots.map(({ id }) => id)).toContain('plot-7');
    state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const watered = step(state, [{ type: 'WaterAll' }], 4_000);
    expect(watered.events).toContainEqual({ type: 'Watered', plotId: 'plot-0' });
  });

  it('applies selling upgrade gates, capacity, speed and sale bonus', () => {
    let state = { ...createInitialState(3, 0, { xp: 10_500 }), coins: 10_000 };
    expect(step(state, [{ type: 'Buy', item: 'quick-counter-2' }], 0).events).toContainEqual(expect.objectContaining({ reason: 'locked' }));
    expect(step(state, [{ type: 'Buy', item: 'quick-counter-3' }], 0).events).toContainEqual(expect.objectContaining({ reason: 'locked' }));
    state = step(state, [{ type: 'Buy', item: 'crate-1' }, { type: 'Buy', item: 'crate-2' },
      { type: 'Buy', item: 'quick-counter-1' }, { type: 'Buy', item: 'quick-counter-2' },
      { type: 'Buy', item: 'quick-counter-3' }, { type: 'Buy', item: 'second-counter' },
      { type: 'Buy', item: 'fresh-produce' }], 0).state;
    expect(getSnapshot(state)).toMatchObject({ crateCapacity: 24, saleIntervalMs: 300 });
    state = { ...state, crate: [{ speciesId: 'sunny-sprout', size: 'regular', mutations: [], value: 10, xp: 10 }] };
    state = step(state, [{ type: 'StartSelling' }], 0).state;
    const sold = step(state, [], 400);
    expect(sold.state.coins).toBe(state.coins + 16);
    expect(sold.events).toContainEqual({ type: 'FruitSold', value: 16, speciesId: 'sunny-sprout', mutations: [] });
  });
});
