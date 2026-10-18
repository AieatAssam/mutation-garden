import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from '../sim';
import {
  commandForPlotActivation,
  createPlotActivationGuard,
  PLOT_ACTIVATION_GUARD_MS,
} from './commands';

describe('commandForPlotActivation', () => {
  const initial = createInitialState(1, 1_000);

  it('plants the selected seed in a known empty plot', () => {
    expect(commandForPlotActivation(getSnapshot(initial), 'plot-0', 'sunny-sprout')).toEqual({
      type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout',
    });
  });

  it('harvests an occupied plot regardless of its current growth stage', () => {
    const planted = step(initial, [{
      type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout',
    }], 1_000).state;

    expect(commandForPlotActivation(getSnapshot(planted), 'plot-0', 'sunny-sprout')).toEqual({
      type: 'Harvest', plotIds: ['plot-0'],
    });
  });

  it('ignores a plot that is absent from the latest snapshot', () => {
    expect(commandForPlotActivation(getSnapshot(initial), 'missing-plot', 'sunny-sprout')).toBeNull();
  });
});

describe('createPlotActivationGuard', () => {
  it('blocks Plant after Harvest until the short window expires', () => {
    const accept = createPlotActivationGuard();
    const harvest = { type: 'Harvest', plotIds: ['plot-0'] } as const;
    const plant = { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' } as const;

    expect(accept(harvest, 1_000)).toBe(true);
    expect(accept(plant, 1_000 + PLOT_ACTIVATION_GUARD_MS - 1)).toBe(false);
    expect(accept(plant, 1_000 + PLOT_ACTIVATION_GUARD_MS)).toBe(true);
  });

  it('allows Plant followed by Harvest and tracks plots independently', () => {
    const accept = createPlotActivationGuard();
    const plant = { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' } as const;
    const harvest = { type: 'Harvest', plotIds: ['plot-0'] } as const;

    expect(accept(plant, 1_000)).toBe(true);
    expect(accept(harvest, 1_001)).toBe(true);
    expect(accept({ type: 'Harvest', plotIds: ['plot-1'] }, 1_001)).toBe(true);
    expect(accept({ type: 'Plant', plotId: 'plot-6', seedId: 'sunny-sprout' }, 1_001)).toBe(false);
  });

  it('allows repeated Harvest intents while preserving the latest Harvest time', () => {
    const accept = createPlotActivationGuard();
    const harvest = { type: 'Harvest', plotIds: ['plot-0'] } as const;
    const plant = { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' } as const;

    expect(accept(harvest, 1_000)).toBe(true);
    expect(accept(harvest, 1_001)).toBe(true);
    expect(accept(plant, 1_001 + PLOT_ACTIVATION_GUARD_MS - 1)).toBe(false);
    expect(accept(plant, 1_001 + PLOT_ACTIVATION_GUARD_MS)).toBe(true);
  });
});
