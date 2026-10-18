import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, type Material } from 'three';
import type { PlantSnapshot } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { createSunnySprout } from './sunny-sprout';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const setup = () => { const library = createMaterialLibrary(); libraries.push(library); return { library, rig: createSunnySprout(library) }; };
const plant = (stage: PlantSnapshot['stage'], progress: number): PlantSnapshot => ({ speciesId: 'sunny-sprout', plantedAt: 0, stage, progress });
const meshes = (rig: ReturnType<typeof createSunnySprout>) => {
  const result: Mesh[] = []; rig.root.traverse((object) => { if (object instanceof Mesh) result.push(object); }); return result;
};
const pose = (rig: ReturnType<typeof createSunnySprout>) => [rig.root.scale.y, ...meshes(rig).flatMap((mesh) => [
  ...mesh.position.toArray(), ...mesh.quaternion.toArray(), ...mesh.scale.toArray(), mesh.parent?.rotation.z ?? 0,
])];

describe('createSunnySprout', () => {
  it('keeps mesh and geometry identities and continuous transforms across all five growth stages', () => {
    const { rig } = setup(); const original = meshes(rig); const boundaries = [0.125, 0.375, 0.875, 1];
    const stages: PlantSnapshot['stage'][] = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];
    const progress = [0.05, 0.25, 0.6, 0.93, 1]; let priorStem = 0;
    stages.forEach((stage, index) => {
      const value = progress[index]!; expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true);
      rig.update(plant(stage, value), 0, true);
      const current = meshes(rig); current.forEach((mesh, i) => { expect(mesh).toBe(original[i]); expect(mesh.geometry).toBe(original[i]!.geometry); });
      const stem = current.find((mesh) => mesh.userData.part === 'stem')!;
      expect(stem.scale.y).toBeGreaterThan(priorStem); priorStem = stem.scale.y;
      if (index < 4) {
        const edge = boundaries[index]!; rig.update(plant(stage, edge - 1e-5), 0, true); const before = pose(rig);
        rig.update(plant(stages[index + 1]!, edge), 0, true);
        pose(rig).forEach((n, i) => expect(Math.abs(n - before[i]!)).toBeLessThan(0.001));
      }
    }); rig.dispose();
  });

  it('shows a halo and wobble only when harvestable', () => {
    const { rig } = setup(); const parts = meshes(rig); const halo = parts.find((mesh) => mesh.userData.part === 'halo')!;
    const fruit = parts.find((mesh) => mesh.userData.part === 'fruit')!;
    (['Seed', 'Sprout', 'Growing', 'Mature'] as const).forEach((stage) => {
      rig.update(plant(stage, 0.5), 600, false); expect(halo.visible).toBe(false); expect(fruit.parent!.rotation.z).toBe(0);
    });
    rig.update(plant('Harvestable', 1), 0, false); expect(halo.visible).toBe(true); const atRest = fruit.parent!.rotation.z;
    rig.update(plant('Harvestable', 1), 600, false); expect(fruit.parent!.rotation.z).not.toBe(atRest); rig.dispose();
  });

  it('freezes presentation motion but keeps growth when reduced motion is enabled', () => {
    const { rig } = setup(); rig.update(plant('Sprout', 0.2), 0, true); const still = pose(rig);
    rig.update(plant('Sprout', 0.2), 60_000, true); expect(pose(rig)).toEqual(still);
    rig.update(plant('Growing', 0.6), 60_000, true); expect(pose(rig)).not.toEqual(still);
    rig.update(plant('Harvestable', 1), 60_000, true);
    expect(meshes(rig).find((mesh) => mesh.userData.part === 'halo')!.visible).toBe(true); rig.dispose();
  });

  it('disposes owned resources once without disposing borrowed materials', () => {
    const { rig } = setup(); const allMeshes = meshes(rig);
    const geometries = [...new Set(allMeshes.filter((mesh) => mesh.userData.part !== 'blob').map((mesh) => mesh.geometry))]
      .map((geometry) => vi.spyOn(geometry, 'dispose'));
    const owned = allMeshes.find((mesh) => mesh.userData.part === 'halo')!.material;
    const ownedDispose = vi.spyOn(owned as Material, 'dispose');
    const blobGeometry = vi.spyOn(allMeshes.find((mesh) => mesh.userData.part === 'blob')!.geometry, 'dispose');
    const borrowed = [...new Set(allMeshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
      .filter((material) => material !== owned).map((material) => vi.spyOn(material, 'dispose'));
    rig.dispose(); rig.dispose(); geometries.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(ownedDispose).toHaveBeenCalledTimes(1); expect(blobGeometry).not.toHaveBeenCalled();
    borrowed.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
