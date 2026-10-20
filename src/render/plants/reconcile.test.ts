import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, Group, Mesh, Vector3, type Material, type Object3D } from 'three';
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
const isSemanticSurface = (mesh: Mesh) => {
  const name = String(mesh.userData.part ?? mesh.name);
  return !name.includes('outline') && name !== 'blob' && name !== 'halo' && name !== 'ripe-halo';
};
const semanticWorldTop = (anchor: Group) => {
  anchor.updateWorldMatrix(true, true);
  const top = new Vector3(0, -Infinity, 0);
  const bounds = new Box3();
  anchor.traverse((node) => {
    if (!(node instanceof Mesh) || !isSemanticSurface(node)) return;
    let visible = true;
    for (let current: Object3D | null = node; current; current = current.parent) visible &&= current.visible;
    if (!visible) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    bounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    if (bounds.max.y > top.y) {
      top.set((bounds.min.x + bounds.max.x) / 2, bounds.max.y, (bounds.min.z + bounds.max.z) / 2);
    }
  });
  return top;
};

describe('plant reconciliation', () => {
  it('reports the visible semantic world-space top for every supported plant and follows live growth and animation', () => {
    const { anchors, reconciler } = setup(['plot-0', 'plot-1', 'plot-2']);
    const target = new Vector3(99, 99, 99);
    const cases: PlantSnapshot[] = [
      plant(1, 0.2, 'Growing', 'sunny-sprout'),
      plant(2, 0.55, 'Growing', 'bubble-berry'),
      plant(3, 0.42, 'Growing', 'twistroot'),
    ];

    cases.forEach((value, index) => {
      const before = snap(100, [null, null, null]);
      // Keep only the selected plant while preserving its plot id.
      const selected = snap(100, [value], [`plot-${index}`]);
      reconciler.update(before, selected, 1, true);
      anchors[index]!.position.set(index + 1, 0.5, -index - 2);
      anchors[index]!.rotation.y = Math.PI / 4;
      anchors[index]!.scale.set(1.2, 1.1, 0.8);
      expect(reconciler.getTop(`plot-${index}`, target)).toBe(true);
      const expected = semanticWorldTop(anchors[index]!);
      expect(target.x).toBeCloseTo(expected.x, 5);
      expect(target.y).toBeCloseTo(expected.y, 5);
      expect(target.z).toBeCloseTo(expected.z, 5);
    });

    const sunny = plant(10, 0.15, 'Growing', 'sunny-sprout');
    const moreGrown = { ...sunny, progress: 0.78 };
    reconciler.update(snap(100, [null]), snap(100, [sunny]), 1, false);
    const early = new Vector3();
    expect(reconciler.getTop('plot-0', early)).toBe(true);
    reconciler.update(snap(100, [sunny]), snap(100, [moreGrown]), 1, false);
    const grown = new Vector3();
    expect(reconciler.getTop('plot-0', grown)).toBe(true);
    expect(grown.y).toBeGreaterThan(early.y);

    const ripe = { ...moreGrown, stage: 'Harvestable' as const };
    reconciler.update(snap(100, [moreGrown]), snap(100, [ripe]), 1, false);
    const animatedA = new Vector3();
    const animatedB = new Vector3();
    expect(reconciler.getTop('plot-0', animatedA)).toBe(true);
    reconciler.update(snap(850, [ripe]), snap(850, [ripe]), 1, false);
    expect(reconciler.getTop('plot-0', animatedB)).toBe(true);
    expect(animatedA.distanceTo(animatedB)).toBeGreaterThan(0);
    reconciler.dispose();
  });

  it('does not report outlines, hidden surfaces, blobs or halos as the top and preserves the target when no plant is available', () => {
    const { anchors, reconciler } = setup();
    const target = new Vector3(7, 8, 9);
    const untouched = () => expect(target.toArray()).toEqual([7, 8, 9]);
    expect(reconciler.getTop('missing-plot' as PlotId, target)).toBe(false); untouched();
    expect(reconciler.getTop('plot-0', target)).toBe(false); untouched();

    const bubble = plant(1, 0.8, 'Harvestable', 'bubble-berry');
    reconciler.update(snap(0, [null]), snap(100, [bubble]), 1, true);
    const rig = anchors[0]!.children[0]!;
    const berries = part(rig, 'berries');
    const outline = part(rig, 'berries-outline');
    const halo = part(rig, 'halo');
    const blob = part(rig, 'blob');
    berries.visible = false;
    outline.position.y = 100;
    halo.position.y = 100;
    blob.position.y = 100;
    const expected = semanticWorldTop(anchors[0]!);
    expect(reconciler.getTop('plot-0', target)).toBe(true);
    expect(target.x).toBeCloseTo(expected.x, 5);
    expect(target.y).toBeCloseTo(expected.y, 5);
    expect(target.z).toBeCloseTo(expected.z, 5);
    expect(target.y).toBeLessThan(100);

    const visibleTarget = target.clone();
    anchors[0]!.visible = false;
    expect(reconciler.getTop('plot-0', target)).toBe(false);
    expect(target.equals(visibleTarget)).toBe(true);
    anchors[0]!.visible = true;

    const oldTarget = target.clone();
    reconciler.update(snap(100, [bubble]), snap(101, [null]), 1, true);
    expect(reconciler.getTop('plot-0', target)).toBe(false); expect(target.equals(oldTarget)).toBe(true);
    const replacement = plant(102, 0.3, 'Sprout', 'twistroot');
    reconciler.update(snap(101, [null]), snap(102, [replacement]), 1, true);
    expect(reconciler.getTop('plot-0', target)).toBe(true);
    const replacementTop = semanticWorldTop(anchors[0]!);
    expect(target.x).toBeCloseTo(replacementTop.x, 5);
    expect(target.y).toBeCloseTo(replacementTop.y, 5);
    expect(target.z).toBeCloseTo(replacementTop.z, 5);
    reconciler.dispose();
    const afterDispose = target.clone();
    expect(reconciler.getTop('plot-0', target)).toBe(false); expect(target.equals(afterDispose)).toBe(true);
  });

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
    const unsupported = { ...plant(4, 0.3, 'Sprout'), speciesId: 'unsupported' } as unknown as PlantSnapshot;
    reconciler.update(snap(3, [plant(3, 0.2)]), snap(4, [unsupported]), 0, true);
    expect(anchors[0]!.children).toHaveLength(0); reconciler.dispose(); reconciler.dispose();
    expect(borrowed.every((dispose) => dispose.mock.calls.length === 0)).toBe(true);
    expect(materials.toon).toBeDefined();
  });

  it('replaces Sunny with Bubble, clears harvested rigs and creates a new rig when Bubble is replanted', () => {
    const { anchors, reconciler } = setup();
    const sunny = plant(10, 0.8, 'Mature', 'sunny-sprout');
    reconciler.update(snap(100, [sunny]), snap(101, [sunny]), 1, true);
    const sunnyRig = anchors[0]!.children[0]!;
    expect(part(sunnyRig, 'fruit')).toBeDefined();

    const bubble: PlantSnapshot = { speciesId: 'bubble-berry', plantedAt: 10, progress: 0.55, stage: 'Growing' };
    reconciler.update(snap(101, [sunny]), snap(102, [bubble]), 1, true);
    const bubbleRig = anchors[0]!.children[0]!;
    expect(bubbleRig).not.toBe(sunnyRig); expect(anchors[0]!.children).toHaveLength(1);
    expect(part(bubbleRig, 'berries')).toBeDefined(); expect(part(bubbleRig, 'halo').visible).toBe(false);

    const ripe: PlantSnapshot = { ...bubble, progress: 1, stage: 'Harvestable' };
    reconciler.update(snap(102, [bubble]), snap(103, [ripe]), 1, true);
    expect(part(bubbleRig, 'halo').visible).toBe(true);
    reconciler.update(snap(103, [ripe]), snap(104, [null]), 1, true);
    expect(anchors[0]!.children).toHaveLength(0);
    reconciler.update(snap(104, [null]), snap(105, [{ ...bubble, plantedAt: 105, progress: 0.12, stage: 'Sprout' }]), 1, true);
    const replanted = anchors[0]!.children[0]!;
    expect(replanted).not.toBe(bubbleRig); expect(part(replanted, 'berries')).toBeDefined();
    reconciler.dispose();
  });

  it('creates and reuses Twistroot, replaces other species, and removes it on harvest or replant', () => {
    const { anchors, reconciler } = setup();
    const sunny = plant(1, 0.4, 'Growing', 'sunny-sprout');
    reconciler.update(snap(100, [sunny]), snap(101, [sunny]), 1, true);
    const sunnyRig = anchors[0]!.children[0]!;
    const twistroot: PlantSnapshot = { speciesId: 'twistroot', plantedAt: 2, progress: 0.4, stage: 'Growing' };
    reconciler.update(snap(101, [sunny]), snap(102, [twistroot]), 1, true);
    const rootRig = anchors[0]!.children[0]!;
    expect(rootRig).not.toBe(sunnyRig);
    expect(part(rootRig, 'root-body')).toBeDefined();
    expect(part(rootRig, 'ripe-halo').visible).toBe(false);

    const growing: PlantSnapshot = { ...twistroot, progress: 0.88, stage: 'Mature' };
    reconciler.update(snap(102, [twistroot]), snap(103, [growing]), 1, true);
    expect(anchors[0]!.children[0]).toBe(rootRig);
    expect(part(rootRig, 'root-body')).toBeDefined();

    const ripe: PlantSnapshot = { ...twistroot, progress: 1, stage: 'Harvestable' };
    reconciler.update(snap(103, [growing]), snap(104, [ripe]), 1, true);
    expect(anchors[0]!.children[0]).toBe(rootRig);
    expect(part(rootRig, 'ripe-halo').visible).toBe(true);

    reconciler.update(snap(104, [ripe]), snap(105, [null]), 1, true);
    expect(anchors[0]!.children).toHaveLength(0);
    reconciler.update(snap(105, [null]), snap(106, [{ ...twistroot, plantedAt: 106, progress: 0.12, stage: 'Sprout' }]), 1, true);
    const replanted = anchors[0]!.children[0]!;
    expect(replanted).not.toBe(rootRig);
    expect(part(replanted, 'root-body')).toBeDefined();
    reconciler.dispose();
  });
});
