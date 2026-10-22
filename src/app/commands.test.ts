import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from '../sim';
import {
  commandForSwipeHarvest,
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

  it('waters a growing plant and harvests a ripe one', () => {
    const planted = step(initial, [{
      type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout',
    }], 1_000).state;

    expect(commandForPlotActivation(getSnapshot(planted), 'plot-0', 'sunny-sprout')).toEqual({
      type: 'Water', plotId: 'plot-0',
    });
    const ripe = step(planted, [], 9_000).state;
    expect(commandForPlotActivation(getSnapshot(ripe), 'plot-0', 'sunny-sprout')).toEqual({
      type: 'Harvest', plotIds: ['plot-0'],
    });
  });

  it('ignores a plot that is absent from the latest snapshot', () => {
    expect(commandForPlotActivation(getSnapshot(initial), 'missing-plot', 'sunny-sprout')).toBeNull();
  });
});

describe('commandForSwipeHarvest', () => {
  it('keeps distinct occupied plots in incoming order, including unripe plants', () => {
    const initial = createInitialState(1, 1_000);
    const planted = step(initial, [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-2', seedId: 'sunny-sprout' },
    ], 1_000).state;
    const incoming = Object.freeze([
      'plot-2', 'plot-1', 'plot-0', 'plot-2', 'unknown-plot', 'plot-1',
    ]) as readonly import('../sim').PlotId[];
    const originalIds = [...incoming];
    const originalSnapshot = getSnapshot(planted);

    expect(commandForSwipeHarvest(originalSnapshot, incoming)).toEqual({
      type: 'Harvest', plotIds: ['plot-2', 'plot-0'],
    });
    expect(incoming).toEqual(originalIds);
    expect(originalSnapshot).toEqual(getSnapshot(planted));
    expect(originalSnapshot.plots.find(({ id }) => id === 'plot-2')?.plant?.stage).toBe('Seed');
  });

  it('returns null when no incoming ID is a known occupied plot', () => {
    const snapshot = getSnapshot(createInitialState(1, 1_000));
    const incoming = Object.freeze([
      'plot-0', 'missing-plot', 'plot-0',
    ]) as readonly import('../sim').PlotId[];
    const originalIds = [...incoming];

    expect(commandForSwipeHarvest(snapshot, incoming)).toBeNull();
    expect(incoming).toEqual(originalIds);
    expect(snapshot).toEqual(getSnapshot(createInitialState(1, 1_000)));
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
