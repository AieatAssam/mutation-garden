import { describe, expect, it } from 'vitest';
import { createInitialState, step } from '../index';

describe('shop purchases', () => {
  it('validates level, price, ownership and adds plots only after payment', () => {
    const locked = step(createInitialState(1, 0), [{ type: 'Buy', item: 'plot-6' }], 0);
    expect(locked.events).toContainEqual(expect.objectContaining({ reason: 'locked' }));
    const poor = step({ ...createInitialState(1, 0, { xp: 6 }), coins: 39 }, [{ type: 'Buy', item: 'plot-6' }], 0);
    expect(poor.events).toContainEqual(expect.objectContaining({ reason: 'insufficient-coins' }));
    const bought = step({ ...poor.state, coins: 40 }, [{ type: 'Buy', item: 'plot-6' }], 0);
    expect(bought.state.coins).toBe(0);
    expect(bought.state.plots.at(-1)).toEqual({ id: 'plot-6', plant: null });
    expect(step(bought.state, [{ type: 'Buy', item: 'plot-6' }], 0).events).toContainEqual(expect.objectContaining({ reason: 'owned' }));
  });

  it('consumes fertiliser on the next seed and applies a 40% time reduction', () => {
    let state = { ...createInitialState(2, 0), coins: 26 };
    state = step(state, [{ type: 'Buy', item: 'fertiliser' }], 0).state;
    expect(state.fertiliser).toBe(1);
    state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    expect(state.fertiliser).toBe(0);
    expect(state.plots[0]?.plant).toMatchObject({ fertilised: true, boostMs: 3_200 });
  });

  it('requires the first plot before buying the second and waters all plants with Big can', () => {
    let state = { ...createInitialState(3, 0, { xp: 60 }), coins: 221 };
    expect(step(state, [{ type: 'Buy', item: 'plot-7' }], 0).events).toContainEqual(expect.objectContaining({ reason: 'locked' }));
    state = step(state, [{ type: 'Buy', item: 'plot-6' }, { type: 'Buy', item: 'plot-7' }, { type: 'Buy', item: 'big-can' }], 0).state;
    expect(state.plots.map(({ id }) => id)).toContain('plot-7');
    state = step(state, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
    const watered = step(state, [{ type: 'WaterAll' }], 2_000);
    expect(watered.events).toContainEqual({ type: 'Watered', plotId: 'plot-0' });
  });
});
