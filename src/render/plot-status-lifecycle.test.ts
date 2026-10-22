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
    h.lifecycle.update(previous, previous, 1, undefined, 100, false);
    h.lifecycle.update(replacement, previous, 0, undefined, 120, false);
    expect(h.dial()?.progress).toBe(1);
    expect(h.rendered()[0]?.dialScale).toBe(1);
    expect(h.stamp()?.scale).toBe(0);
    expect(h.dial()?.color).toBe('green');
    expect(h.dial()?.stageFractions).toEqual([0.12, 0.4, 0.88]);
    expect(h.stamp()?.color).toBe('green');
    expect(h.stamp()?.center.y).toBeCloseTo(1.45);
    expect(h.rendered()).toHaveLength(1);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([
      expect.objectContaining({ plotId: 'plot-0', visibleDiameter: 0, opacity: 1, drawOrder: 0 }),
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
    expect(h.rendered().find((descriptor) => descriptor.plotId === 'plot-0')?.stamp?.opacity).toBe(1);
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

  it('springs the ready dial and stamp to their exact scales over the specified intervals', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(mature, mature, 1, undefined, 0, false);
    h.lifecycle.update(ready, mature, 1, undefined, 1, false);
    expect(h.stamp()?.scale).toBe(0);
    expect(h.rendered()[0]?.dialScale).toBe(1);

    h.lifecycle.update(ready, mature, 1, undefined, 129, false);
    expect(h.stamp()?.scale).toBeGreaterThan(1);
    expect(h.stamp()?.scale).toBeLessThanOrEqual(1.15);
    expect(h.rendered()[0]?.dialScale).toBeGreaterThan(1);
    const peakStamp = h.stamp();
    const peakPick = h.lifecycle.getStampPickDescriptors()[0];
    if (!peakStamp || peakStamp.scale === undefined || !peakPick) {
      throw new Error('Expected a ready stamp at its spring peak');
    }
    expect(peakPick.visibleDiameter).toBeCloseTo(0.62 * peakStamp.scale, 8);

    h.lifecycle.update(ready, mature, 1, undefined, 161, false);
    expect(h.rendered()[0]?.dialScale).toBe(1);
    h.lifecycle.update(ready, mature, 1, undefined, 221, false);
    expect(h.stamp()?.scale).toBe(1);
  });

  it('animates after skipped stages and treats an already-ready plant as settled', () => {
    const h = harness();
    const empty = snapshot(0, { 'plot-0': null, 'plot-1': null });
    const skipped = snapshot(1000, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(skipped, empty, 1, undefined, 1000, false);
    expect(h.stamp()?.scale).toBe(0);
    expect(h.rendered()[0]?.dialScale).toBe(1);

    const attached = harness();
    const alreadyReady = snapshot(2000, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    attached.lifecycle.update(alreadyReady, alreadyReady, 1, undefined, 2000, false);
    expect(attached.stamp()?.scale).toBe(1);
    expect(attached.rendered()[0]?.dialScale).toBe(1);
  });

  it('starts the ready arrival when ripe snapshots were skipped by the renderer', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ripe = snapshot(100, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(mature, mature, 1, undefined, 0, false);
    // Both simulation snapshots are ripe, but the last presented frame was Mature.
    h.lifecycle.update(ripe, ripe, 1, undefined, 100, false);
    expect(h.stamp()?.scale).toBe(0);
    expect(h.rendered()[0]?.dialScale).toBe(1);
  });

  it('uses a reduced-motion fade and never replays a settled arrival when motion is restored', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, mature, 1, undefined, 1, true);
    expect(h.stamp()?.scale).toBe(1);
    expect(h.stamp()?.opacity).toBe(0);
    expect(h.lifecycle.getStampPickDescriptors()[0]).toMatchObject({ visibleDiameter: 0.62, opacity: 0 });
    h.lifecycle.update(ready, mature, 1, undefined, 61, true);
    expect(h.stamp()?.opacity).toBeCloseTo(0.5);
    expect(h.lifecycle.getStampPickDescriptors()[0]?.opacity).toBeCloseTo(0.5);
    h.lifecycle.update(ready, mature, 1, undefined, 121, true);
    expect(h.stamp()?.opacity).toBe(1);
    h.lifecycle.update(ready, mature, 1, undefined, 122, false);
    expect(h.stamp()?.scale).toBe(1);
    expect(h.rendered()[0]?.dialScale).toBe(1);
  });

  it('removes scale overshoot immediately when reduced motion is enabled mid-pop', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, mature, 1, undefined, 1, false);
    h.lifecycle.update(ready, mature, 1, undefined, 100, false);
    expect(h.stamp()?.scale).toBeGreaterThan(1);
    expect(h.rendered()[0]?.dialScale).toBeGreaterThan(1);
    h.lifecycle.update(ready, mature, 1, undefined, 100, true);
    expect(h.stamp()?.scale).toBe(1);
    expect(h.rendered()[0]?.dialScale).toBe(1);
    expect(h.lifecycle.getStampPickDescriptors()).toHaveLength(1);
  });

  it('keeps the arrival settled when reduced motion is later turned off', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, mature, 1, undefined, 1, false);
    h.lifecycle.update(ready, mature, 1, undefined, 30, true);
    expect(h.stamp()?.scale).toBe(1);
    expect(h.rendered()[0]?.dialScale).toBe(1);
    h.lifecycle.update(ready, mature, 1, undefined, 40, false);
    expect(h.stamp()?.scale).toBe(1);
    expect(h.rendered()[0]?.dialScale).toBe(1);
  });

  it('fades a harvested stamp from its last presented center, scale, and opacity and removes picking first', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, mature, 1, undefined, 1, false);
    h.lifecycle.update(ready, mature, 1, undefined, 100, false);
    const presented = h.stamp()!;
    const presentedScale = presented.scale ?? 1;
    const presentedOpacity = presented.opacity ?? 1;
    const harvested = snapshot(100, { 'plot-0': null, 'plot-1': null });
    h.lifecycle.update(harvested, ready, 1, undefined, 100, false);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([]);
    expect(h.stamp()?.center).toEqual(presented.center);
    expect(h.stamp()?.scale).toBe(presentedScale);
    expect(h.stamp()?.opacity).toBe(presentedOpacity);
    h.lifecycle.update(snapshot(160, { 'plot-0': null, 'plot-1': null }), harvested, 1, undefined, 160, false);
    expect(h.stamp()?.scale).toBe(presentedScale);
    expect(h.stamp()?.opacity).toBeCloseTo(presentedOpacity * 0.5);
    h.lifecycle.update(snapshot(221, { 'plot-0': null, 'plot-1': null }), harvested, 1, undefined, 221, false);
    expect(h.rendered()).toEqual([]);
  });

  it('fades a harvested stamp when both snapshots are empty after skipped simulation ticks', () => {
    const h = harness();
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, ready, 1, undefined, 1, false);
    const empty = snapshot(100, { 'plot-0': null, 'plot-1': null });
    h.lifecycle.update(empty, empty, 1, undefined, 100, false);
    expect(h.lifecycle.getStampPickDescriptors()).toEqual([]);
    expect(h.stamp()?.opacity).toBe(1);
    h.lifecycle.update(snapshot(160, { 'plot-0': null, 'plot-1': null }), empty, 1, undefined, 160, false);
    expect(h.stamp()?.opacity).toBeCloseTo(0.5);
  });

  it('continues harvest fade from the current reduced-motion fade opacity', () => {
    const h = harness();
    const mature = snapshot(0, { 'plot-0': plant('Mature', 0.99), 'plot-1': null });
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, mature, 1, undefined, 1, true);
    h.lifecycle.update(ready, mature, 1, undefined, 61, true);
    const harvested = snapshot(61, { 'plot-0': null, 'plot-1': null });
    h.lifecycle.update(harvested, ready, 1, undefined, 61, true);
    expect(h.stamp()?.opacity).toBeCloseTo(0.5);
    h.lifecycle.update(snapshot(121, { 'plot-0': null, 'plot-1': null }), harvested, 1, undefined, 121, true);
    expect(h.stamp()?.opacity).toBeCloseTo(0.25);
  });

  it('clears a harvested fade when its plot is removed before it is readded', () => {
    const h = harness();
    const ready = snapshot(1, { 'plot-0': plant('Harvestable', 1), 'plot-1': null });
    h.lifecycle.update(ready, ready, 1, undefined, 1, false);
    h.lifecycle.update(snapshot(2, { 'plot-0': null, 'plot-1': null }), ready, 1, undefined, 2, false);
    h.lifecycle.update(snapshot(3, {}), snapshot(2, { 'plot-0': null, 'plot-1': null }), 1, undefined, 3, false);
    h.lifecycle.update(snapshot(22, { 'plot-0': null }), snapshot(3, {}), 1, undefined, 22, false);
    expect(h.rendered()).toEqual([]);
  });
});
