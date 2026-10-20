import { Group, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { GardenSnapshot, PlantSnapshot, PlotId, SpeciesId } from '../sim';
import type { PlotStatusDescriptor, PlotStatusResources } from './plot-status';
import { createPlotStatusLifecycle, type PlotStatusSpecies } from './plot-status-lifecycle';

const species: readonly PlotStatusSpecies[] = [
  { id: 'sunny-sprout', stageFractions: [0.1, 0.3, 0.7], fruitColor: 'red' },
  { id: 'bubble-berry', stageFractions: [0.1, 0.4, 0.8], fruitColor: 'blue' },
  { id: 'twistroot', stageFractions: [0.12, 0.4, 0.88], fruitColor: 'green' },
];

function snapshot(nowMs: number, plants: Readonly<Record<string, PlantSnapshot | null>>): GardenSnapshot {
  return { nowMs, coins: 12, plots: Object.entries(plants).map(([id, plant]) => ({ id, plant })) };
}

function plant(stage: PlantSnapshot['stage'], progress: number, speciesId: SpeciesId = 'sunny-sprout', plantedAt = 0): PlantSnapshot {
  return { speciesId, plantedAt, stage, progress };
}

function harness(plotIds: readonly PlotId[] = ['plot-0', 'plot-1']) {
  let rendered: readonly PlotStatusDescriptor[] = [];
  const resources: PlotStatusResources = {
    group: new Group(),
    update: vi.fn((descriptors: readonly PlotStatusDescriptor[]) => { rendered = descriptors.map((item) => ({ ...item })); }),
    dispose: vi.fn(),
  };
  const centers = new Map(plotIds.map((id, index) => [id, new Vector3(index * 2, 0, 0)]));
  const lifecycle = createPlotStatusLifecycle({
    resources,
    species,
    getDialCenter: (id, target) => {
      const center = centers.get(id);
      if (!center) return false;
      target.copy(center);
      return true;
    },
    getPlantTop: (id, target) => {
      const center = centers.get(id);
      if (!center) return false;
      target.copy(center).add(new Vector3(0, 1, 0));
      return true;
    },
  });
  return {
    lifecycle,
    resources,
    rendered: () => rendered,
    centers,
    dial: (plotId = 'plot-0') => rendered.find((item) => item.plotId === plotId)?.dial,
    stamp: (plotId = 'plot-0') => rendered.find((item) => item.plotId === plotId)?.stamp,
  };
}

describe('plot status snapshot reconciliation', () => {
  it('renders no status for empty plots and interpolates progress for a matching plant identity', () => {
    const h = harness();
    const empty = snapshot(0, { 'plot-0': null, 'plot-1': null });
    h.lifecycle.update(empty, empty, 1);
    expect(h.rendered()).toEqual([]);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([]);

    const previous = snapshot(50, { 'plot-0': plant('Sprout', 0.2), 'plot-1': null });
    const current = snapshot(100, { 'plot-0': plant('Growing', 0.4), 'plot-1': null });
    h.lifecycle.update(current, previous, 0.5);
    expect(h.rendered()).toHaveLength(1);
    expect(h.dial()?.progress).toBeCloseTo(0.3);
    expect(h.dial()?.stageFractions).toEqual([0.1, 0.3, 0.7]);
    expect(h.stamp()).toBeUndefined();
  });

  it('uses current progress for a replacement and full fill plus a stamp for Harvestable', () => {
    const h = harness();
    const previous = snapshot(100, { 'plot-0': plant('Growing', 0.9, 'sunny-sprout', 10), 'plot-1': null });
    const replacement = snapshot(120, { 'plot-0': plant('Harvestable', 0.25, 'twistroot', 11), 'plot-1': null });
    h.lifecycle.update(replacement, previous, 0);
    expect(h.dial()?.progress).toBe(1);
    expect(h.dial()?.color).toBe('green');
    expect(h.dial()?.stageFractions).toEqual([0.12, 0.4, 0.88]);
    expect(h.stamp()?.color).toBe('green');
    expect(h.stamp()?.center.y).toBeCloseTo(1.22);
    expect(h.rendered()).toHaveLength(1);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([
      expect.objectContaining({ plotId: 'plot-0', visibleDiameter: expect.any(Number), drawOrder: 0 }),
    ]);
  });

  it('does not interpolate across a species or plantedAt replacement', () => {
    const h = harness();
    const previous = snapshot(100, { 'plot-0': plant('Growing', 0.9, 'sunny-sprout', 10), 'plot-1': null });
    const current = snapshot(120, { 'plot-0': plant('Growing', 0.25, 'bubble-berry', 11), 'plot-1': null });
    h.lifecycle.update(current, previous, 0);
    expect(h.dial()?.progress).toBe(0.25);
    expect(h.dial()?.color).toBe('blue');
  });

  it('clears stamp descriptors when a plant is harvested or its plot is removed', () => {
    const h = harness();
    const ready = snapshot(100, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, ready, 1);
    expect(h.lifecycle.getStampPickDescriptors()).toHaveLength(1);
    h.lifecycle.update(snapshot(110, { 'plot-0': null, 'plot-1': null }), ready, 1);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([]);
    expect(h.rendered().every((descriptor) => descriptor.plotId !== 'plot-0')).toBe(true);
    h.lifecycle.update(ready, ready, 1);
    h.lifecycle.update(snapshot(120, {}), ready, 1);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([]);
    expect(h.rendered()).toEqual([]);
  });

  it('produces one bounded descriptor for each of six ready plots', () => {
    const plotIds = Array.from({ length: 6 }, (_, index) => `plot-${index}`);
    const h = harness(plotIds);
    const ready = {
      coins: 12,
      nowMs: 1,
      plots: plotIds.map((id, index) => ({ id, plant: plant('Harvestable', 1, species[index % species.length]!.id, index) })),
    } satisfies GardenSnapshot;
    h.lifecycle.update(ready, ready, 1);
    expect(h.rendered()).toHaveLength(6);
    expect(h.rendered().every((descriptor) => descriptor.dial && descriptor.stamp)).toBe(true);
    expect(h.lifecycle.getStampPickDescriptors()).toHaveLength(6);
  });

  it('copies the current camera orientation and sorts ready stamps back-to-front with stable ties', () => {
    const h = harness();
    h.centers.get('plot-0')!.z = 1;
    h.centers.get('plot-1')!.z = -1;
    const facing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3);
    const ready = snapshot(1, {
      'plot-0': plant('Harvestable', 1),
      'plot-1': plant('Harvestable', 1, 'bubble-berry', 10),
    });
    h.lifecycle.update(ready, ready, 1, facing);
    expect(h.stamp('plot-0')?.facing?.angleTo(facing)).toBeCloseTo(0);
    expect(h.lifecycle.getStampPickDescriptors().map(({ plotId, drawOrder }) => [plotId, drawOrder]))
      .toEqual([['plot-0', 0], ['plot-1', 1]]);
    h.centers.get('plot-0')!.z = 0;
    h.centers.get('plot-1')!.z = 0;
    h.lifecycle.update(ready, ready, 1, new Quaternion());
    expect(h.lifecycle.getStampPickDescriptors().map(({ plotId, drawOrder }) => [plotId, drawOrder]))
      .toEqual([['plot-0', 0], ['plot-1', 1]]);
    const picks = h.lifecycle.getStampPickDescriptors();
    picks[0]!.center.x = 99;
    expect(h.lifecycle.getStampPickDescriptors()[0]?.center.x).toBe(0);
  });

  it('does not expose a stamp when the reconciler has no plant top', () => {
    const resources: PlotStatusResources = { group: new Group(), update: vi.fn(), dispose: vi.fn() };
    const lifecycle = createPlotStatusLifecycle({
      resources,
      species,
      getDialCenter: () => false,
      getPlantTop: () => false,
    });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1) });
    lifecycle.update(ready, ready, 1);
    expect(resources.update).toHaveBeenCalledWith([]);
    expect(lifecycle.getStampPickDescriptors()).toEqual([]);
  });
});
