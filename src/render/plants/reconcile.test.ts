import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, type Material, type Object3D } from 'three';
import type { GardenSnapshot, PlantSnapshot, PlotId } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { createPlantReconciler } from './reconcile';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const setup = (ids: PlotId[] = ['plot-0']) => {
  const materials = createMaterialLibrary(); libraries.push(materials);
  const anchors = ids.map((plotId) => { const anchor = new Group(); Object.defineProperty(anchor, 'plotId', { value: plotId }); return anchor; });
  return { anchors, materials, reconciler: createPlantReconciler(anchors, materials) };
};
const plant = (plantedAt: number, progress: number, stage: PlantSnapshot['stage'] = 'Growing', speciesId: PlantSnapshot['speciesId'] = 'sunny-sprout'): PlantSnapshot => ({ speciesId, plantedAt, progress, stage });
const snap = (nowMs: number, values: (PlantSnapshot | null)[], ids: PlotId[] = values.map((_, i) => `plot-${i}`)) => ({ nowMs, coins: 12, plots: values.map((value, i) => ({ id: ids[i]!, plant: value })) }) as GardenSnapshot;
const part = (root: Object3D, name: string) => { let found: Mesh | undefined; root.traverse((node) => { if (node instanceof Mesh && node.userData.part === name) found = node; }); return found!; };

describe('plant reconciliation', () => {
  it('reuses rigs for repeated frozen snapshots and interpolates clamped endpoints', () => {
    const { anchors, reconciler } = setup();
    const before = snap(100, [plant(1, 0.2)]), after = snap(200, [plant(1, 0.8)]);
    const frozenBefore = Object.freeze({ ...before, plots: Object.freeze(before.plots.map(Object.freeze)) }) as GardenSnapshot;
    const frozenAfter = Object.freeze({ ...after, plots: Object.freeze(after.plots.map(Object.freeze)) }) as GardenSnapshot;
    reconciler.update(frozenBefore, frozenAfter, 0.25, true);
    const rig = anchors[0]!.children[0]!; const stem = part(rig, 'stem'); const atQuarter = stem.scale.y;
    expect(atQuarter).toBeCloseTo(0.07 + 0.78 * (0.35 ** 2 * (3 - 2 * 0.35)));
    reconciler.update(frozenBefore, frozenAfter, 0.25, true);
    expect(anchors[0]!.children).toEqual([rig]); expect(part(rig, 'stem').scale.y).toBe(atQuarter);
    const height = (p: number) => 0.07 + 0.78 * (p * p * (3 - 2 * p));
    reconciler.update(frozenBefore, frozenAfter, -1, true); expect(stem.scale.y).toBeCloseTo(height(0.2));
    reconciler.update(frozenBefore, frozenAfter, 2, true); expect(stem.scale.y).toBeCloseTo(height(0.8)); reconciler.dispose();
  });

  it('keeps current stage and plants replacements at current progress without interpolation', () => {
    const { anchors, reconciler } = setup(); const previous = snap(0, [plant(1, 0.1)]);
    const current = snap(100, [plant(2, 0.65, 'Harvestable')]); reconciler.update(previous, current, 0.5, true);
    const rig = anchors[0]!.children[0]!;
    expect(part(rig, 'halo').visible).toBe(true);
    expect(part(rig, 'stem').scale.y).toBeCloseTo(0.07 + 0.78 * (0.65 ** 2 * (3 - 2 * 0.65)));
    reconciler.dispose();
  });

  it('removes empty, unsupported and replaced plants and disposes owned rig resources once', () => {
    const { anchors, materials, reconciler } = setup();
    reconciler.update(snap(0, [plant(1, 0.5)]), snap(1, [plant(1, 0.5)]), 0, true);
    const root = anchors[0]!.children[0]!; const meshes: Mesh[] = [];
    root.traverse((node) => { if (node instanceof Mesh) meshes.push(node); });
    const geometries = [...new Set(meshes.filter((mesh) => mesh.userData.part !== 'blob').map((mesh) => mesh.geometry))].map((g) => vi.spyOn(g, 'dispose'));
    const halo = vi.spyOn(part(root, 'halo').material as Material, 'dispose');
    const borrowed = [...new Set(meshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))].filter((material) => material !== part(root, 'halo').material).map((m) => vi.spyOn(m, 'dispose'));
    reconciler.update(snap(1, [plant(1, 0.5)]), snap(2, [null]), 0, true);
    expect(anchors[0]!.children).toHaveLength(0); geometries.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(halo).toHaveBeenCalledTimes(1); borrowed.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    reconciler.update(snap(2, [null]), snap(3, [plant(3, 0.2, 'Sprout')]), 0, true);
    const replanted = anchors[0]!.children[0]!; expect(replanted).not.toBe(root);
    reconciler.update(snap(3, [plant(3, 0.2)]), snap(4, [plant(4, 0.3, 'Sprout', 'bubble-berry')]), 0, true);
    expect(anchors[0]!.children).toHaveLength(0); reconciler.dispose(); reconciler.dispose();
    expect(borrowed.every((dispose) => dispose.mock.calls.length === 0)).toBe(true);
    expect(materials.toon).toBeDefined();
  });
});
