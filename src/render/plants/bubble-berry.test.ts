import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, Color, Mesh, type Material } from 'three';
import type { PlantSnapshot } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { palette } from '../palette';
import { createBubbleBerry } from './bubble-berry';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const setup = () => { const library = createMaterialLibrary(); libraries.push(library); return { library, rig: createBubbleBerry(library) }; };
const plant = (stage: PlantSnapshot['stage'], progress: number): PlantSnapshot => ({ speciesId: 'bubble-berry', plantedAt: 0, stage, progress });
const meshes = (rig: ReturnType<typeof createBubbleBerry>) => {
  const result: Mesh[] = []; rig.root.traverse((object) => { if (object instanceof Mesh) result.push(object); }); return result;
};
const part = (rig: ReturnType<typeof createBubbleBerry>, name: string) => meshes(rig).find((mesh) => mesh.userData.part === name)!;
const pose = (rig: ReturnType<typeof createBubbleBerry>) => {
  rig.root.updateMatrixWorld(true);
  return meshes(rig).flatMap((mesh) => mesh.matrixWorld.toArray());
};

describe('createBubbleBerry', () => {
  it('grows the dome and berries and unfurls leaves smoothly through the stages', () => {
    const { rig } = setup(); const original = meshes(rig); const stages: PlantSnapshot['stage'][] = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];
    const berries = part(rig, 'berries'); const leaves = part(rig, 'leaves'); const dome = part(rig, 'dome');
    const berryCluster = berries.parent!; const sample = (progress: number, stage: PlantSnapshot['stage'] = 'Growing') => {
      rig.update(plant(stage, progress), 0, true); rig.root.updateMatrixWorld(true);
      const domeBounds = new Box3().setFromObject(dome);
      const leafBounds = new Box3().setFromObject(leaves);
      return {
        domeSize: dome.scale.x,
        berrySize: berryCluster.scale.x,
        leafScale: leaves.scale.toArray(),
        domeMatrix: dome.matrixWorld.toArray(),
        leafDomeGap: leafBounds.min.y - domeBounds.max.y,
        leafDomeBoundsOverlap: leafBounds.intersectsBox(domeBounds),
      };
    };
    const progress = [0, 0.05, 0.12, 0.3, 0.54, 0.72, 1];
    const growth = progress.map((value) => sample(value));
    for (let index = 1; index < growth.length; index += 1) {
      expect(growth[index]!.domeSize).toBeGreaterThanOrEqual(growth[index - 1]!.domeSize);
      expect(growth[index]!.berrySize).toBeGreaterThanOrEqual(growth[index - 1]!.berrySize);
      expect(growth[index]!.leafScale[0]).toBeGreaterThanOrEqual(growth[index - 1]!.leafScale[0]!);
      expect(growth[index]!.leafScale[1]).toBeGreaterThanOrEqual(growth[index - 1]!.leafScale[1]!);
    }
    expect(growth[0]!.berrySize).toBeLessThan(growth.at(-1)!.berrySize);
    expect(growth[0]!.leafScale[0]).toBeLessThan(growth.at(-1)!.leafScale[0]!);
    [0.04, 0.08, 0.12, 0.54, 0.64, 0.72].forEach((boundary) => {
      const before = sample(boundary - 1e-5); const after = sample(boundary + 1e-5);
      expect(Math.abs(after.domeSize - before.domeSize)).toBeLessThan(0.001);
      after.domeMatrix.forEach((value, index) => expect(Math.abs(value - before.domeMatrix[index]!)).toBeLessThan(0.001));
      expect(Math.abs(after.berrySize - before.berrySize)).toBeLessThan(0.001);
      after.leafScale.forEach((value, index) => expect(Math.abs(value - before.leafScale[index]!)).toBeLessThan(0.001));
    });
    const stageProgress = [0.04, 0.22, 0.53, 0.93, 1];
    const renderedStages = stages.map((stage, index) => sample(stageProgress[index]!, stage));
    expect(renderedStages[0]!.berrySize).toBeLessThan(renderedStages[1]!.berrySize);
    expect(renderedStages[1]!.berrySize).toBeLessThan(renderedStages[2]!.berrySize);
    expect(renderedStages[2]!.berrySize).toBeLessThan(renderedStages[3]!.berrySize);
    expect(renderedStages[3]!.berrySize).toBe(renderedStages[4]!.berrySize);
    expect(renderedStages[0]!.domeSize).toBeLessThan(renderedStages[1]!.domeSize);
    expect(renderedStages[1]!.domeSize).toBeLessThan(renderedStages[2]!.domeSize);
    expect(renderedStages[2]!.domeSize).toBeLessThan(renderedStages[3]!.domeSize);
    expect(renderedStages[3]!.domeSize).toBe(1);
    expect(renderedStages[4]!.domeSize).toBe(1);
    expect(renderedStages[0]!.leafScale[0]).toBeLessThan(renderedStages[1]!.leafScale[0]!);
    expect(renderedStages[1]!.leafScale[0]).toBeLessThan(renderedStages[2]!.leafScale[0]!);
    renderedStages.slice(0, 2).forEach((stage) => {
      expect(stage.leafDomeGap).toBeLessThanOrEqual(0.01);
      expect(stage.leafDomeBoundsOverlap).toBe(true);
    });
    renderedStages.forEach(() => {
      expect(rig.root.scale.toArray()).toEqual([1, 1, 1]);
      meshes(rig).forEach((mesh, meshIndex) => { expect(mesh).toBe(original[meshIndex]); expect(mesh.geometry).toBe(original[meshIndex]!.geometry); });
    });
    expect(renderedStages[3]!.domeMatrix).toEqual(renderedStages[4]!.domeMatrix);
    expect(sample(2).berrySize).toBe(sample(1).berrySize);
    expect(sample(-1).berrySize).toBe(sample(0).berrySize);
    expect(sample(2).domeSize).toBe(sample(1).domeSize);
    expect(sample(-1).domeSize).toBe(sample(0).domeSize);
    rig.dispose();
  });

  it('builds a low berry dome, a leaf ring, four to six berries and highlight dots from the Bubble Berry palette', () => {
    const { rig } = setup(); const all = meshes(rig);
    const dome = part(rig, 'dome'); const leaves = part(rig, 'leaves'); const berries = part(rig, 'berries'); const highlights = part(rig, 'highlights');
    expect([dome, leaves, berries, highlights].every((mesh) => mesh instanceof Mesh)).toBe(true);
    expect(leaves.userData.leafCount).toBeGreaterThanOrEqual(6);
    expect(leaves.userData.leafCount).toBeLessThanOrEqual(12);
    dome.geometry.computeBoundingBox(); berries.geometry.computeBoundingBox();
    const domeBounds = dome.geometry.boundingBox!; const berryBounds = berries.geometry.boundingBox!;
    expect(domeBounds.max.y - domeBounds.min.y).toBeLessThan(domeBounds.max.x - domeBounds.min.x);
    expect(domeBounds.max.y).toBeLessThan(0.35);
    expect(berryBounds.max.y).toBeGreaterThan(domeBounds.max.y);
    expect(dome.material).toHaveProperty('color', new Color(palette.plants['bubble-berry'].stem[1]));
    expect(leaves.material).toHaveProperty('color', new Color(palette.plants['bubble-berry'].leaf[1]));
    expect(berries.material).toHaveProperty('color', new Color(palette.plants['bubble-berry'].fruit[1]));
    expect(highlights.material).toHaveProperty('color', new Color(palette.plants['bubble-berry'].accent.highlight));
    expect(all.filter((mesh) => mesh.userData.part === 'blob')).toHaveLength(1);
    expect(all.filter((mesh) => mesh.userData.part === 'halo')).toHaveLength(1);
    expect(berries.userData.berryCount).toBeGreaterThanOrEqual(4);
    expect(berries.userData.berryCount).toBeLessThanOrEqual(6);
    expect(highlights.userData.highlightCount).toBeGreaterThanOrEqual(berries.userData.berryCount);
    rig.dispose();
  });

  it('shows a ripe halo only at harvestable stage and keeps the signal in reduced motion', () => {
    const { rig } = setup(); const halo = part(rig, 'halo'); const berries = part(rig, 'berries');
    (['Seed', 'Sprout', 'Growing', 'Mature'] as const).forEach((stage) => {
      rig.update(plant(stage, 0.6), 800, false); expect(halo.visible).toBe(false);
    });
    rig.update(plant('Harvestable', 1), 0, false); expect(halo.visible).toBe(true); const rest = berries.rotation.z;
    rig.update(plant('Harvestable', 1), 600, false); expect(berries.rotation.z).not.toBe(rest);
    rig.update(plant('Harvestable', 1), 600, true); const still = pose(rig);
    rig.update(plant('Harvestable', 1), 60_000, true); expect(pose(rig)).toEqual(still); expect(halo.visible).toBe(true);
    rig.dispose();
  });

  it('disposes owned geometry and halo material once while preserving borrowed materials and blob resources', () => {
    const { rig } = setup(); const all = meshes(rig);
    const geometries = [...new Set(all.filter((mesh) => mesh.userData.part !== 'blob').map((mesh) => mesh.geometry))]
      .map((geometry) => vi.spyOn(geometry, 'dispose'));
    const halo = part(rig, 'halo').material; const haloDispose = vi.spyOn(halo as Material, 'dispose');
    const blobGeometry = vi.spyOn(part(rig, 'blob').geometry, 'dispose');
    const borrowed = [...new Set(all.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
      .filter((material) => material !== halo).map((material) => vi.spyOn(material, 'dispose'));
    rig.dispose(); rig.dispose(); geometries.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(haloDispose).toHaveBeenCalledTimes(1); expect(blobGeometry).not.toHaveBeenCalled();
    borrowed.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
