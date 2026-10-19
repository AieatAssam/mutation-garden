import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, Color, CylinderGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Material } from 'three';
import type { PlantSnapshot } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { palette } from '../palette';
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

  it('uses the fruit step 1 colour with enough strength to read as a ripe signal', () => {
    const { rig } = setup(); const halo = meshes(rig).find((mesh) => mesh.userData.part === 'halo')!;
    expect(halo.material).toBeInstanceOf(ShaderMaterial);
    const material = halo.material as ShaderMaterial;
    expect(material.uniforms.tint!.value).toEqual(new Color(palette.plants['sunny-sprout'].fruit[0]));
    expect(material.uniforms.strength!.value).toBeGreaterThanOrEqual(0.45);
    rig.dispose();
  });

  it('faces the halo toward the camera and gives it a broad fruit silhouette footprint', () => {
    const { rig } = setup(); rig.update(plant('Harvestable', 1), 0, true);
    const parts = meshes(rig);
    const halo = parts.find((mesh) => mesh.userData.part === 'halo')!;
    const fruit = parts.find((mesh) => mesh.userData.part === 'fruit')!;
    rig.root.updateMatrixWorld(true);

    const cameraDirection = new Vector3(0.55, 0.45, 0.71).normalize();
    expect(halo.getWorldDirection(new Vector3()).dot(cameraDirection)).toBeGreaterThan(0.99);

    fruit.geometry.computeBoundingBox();
    const bounds = fruit.geometry.boundingBox!;
    const fruitWidth = bounds.max.x - bounds.min.x;
    expect(halo.geometry).toBeInstanceOf(PlaneGeometry);
    const haloWidth = (halo.geometry as PlaneGeometry).parameters.width;
    expect(haloWidth).toBeGreaterThan(fruitWidth * 2);
    rig.dispose();
  });

  it('keeps a thick-stemmed lollipop silhouette with low separated leaves and eight fruit ribs', () => {
    const { rig } = setup();
    rig.update(plant('Harvestable', 1), 0, true);
    rig.root.updateMatrixWorld(true);
    const parts = meshes(rig);
    const stem = parts.find((mesh) => mesh.userData.part === 'stem')!;
    const leftLeaf = parts.find((mesh) => mesh.userData.part === 'left-leaf')!;
    const rightLeaf = parts.find((mesh) => mesh.userData.part === 'right-leaf')!;
    const fruit = parts.find((mesh) => mesh.userData.part === 'fruit')!;

    expect(stem.geometry).toBeInstanceOf(CylinderGeometry);
    const stemGeometry = stem.geometry as CylinderGeometry;
    expect(stemGeometry.parameters.radiusTop * 2).toBeGreaterThanOrEqual(0.14);
    expect(stemGeometry.parameters.radiusBottom * 2).toBeGreaterThanOrEqual(0.14);

    const worldBounds = (mesh: Mesh) => {
      mesh.geometry.computeBoundingBox();
      return new Box3().copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    };
    const fruitBounds = worldBounds(fruit);
    const leftLeafBounds = worldBounds(leftLeaf);
    const rightLeafBounds = worldBounds(rightLeaf);
    const plantBounds = new Box3().union(worldBounds(stem)).union(leftLeafBounds).union(rightLeafBounds).union(fruitBounds);
    const fruitHeight = fruitBounds.max.y - fruitBounds.min.y;
    const plantHeight = plantBounds.max.y - plantBounds.min.y;
    expect(fruitBounds.max.x - fruitBounds.min.x)
      .toBeGreaterThan(leftLeafBounds.max.x - leftLeafBounds.min.x);
    expect(fruitBounds.max.x - fruitBounds.min.x)
      .toBeGreaterThan(rightLeafBounds.max.x - rightLeafBounds.min.x);
    expect(leftLeafBounds.max.x).toBeLessThan(rightLeafBounds.min.x);
    expect(Math.max(leftLeafBounds.max.y, rightLeafBounds.max.y)).toBeLessThan(fruitBounds.min.y);
    expect(fruitHeight / plantHeight).toBeGreaterThanOrEqual(0.35);
    expect(fruitHeight / plantHeight).toBeLessThanOrEqual(0.5);

    const positions = fruit.geometry.getAttribute('position');
    const equator: { angle: number; radius: number }[] = [];
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      if (Math.abs(y) < 1e-6) equator.push({ angle: Math.atan2(z, x), radius: Math.hypot(x, z) });
    }
    equator.sort((a, b) => a.angle - b.angle);
    if (equator.length === 33) equator.pop();
    const peaks = equator.filter((point, index) => {
      const before = equator[(index + equator.length - 1) % equator.length]!;
      const after = equator[(index + 1) % equator.length]!;
      return point.radius > before.radius && point.radius > after.radius;
    });
    expect(equator).toHaveLength(32);
    expect(peaks).toHaveLength(8);
    rig.dispose();
  });

  it('freezes presentation motion but keeps growth when reduced motion is enabled', () => {
    const { rig } = setup(); rig.update(plant('Sprout', 0.2), 0, true); const still = pose(rig);
    rig.update(plant('Sprout', 0.2), 60_000, true); expect(pose(rig)).toEqual(still);
    rig.update(plant('Growing', 0.6), 60_000, true); expect(pose(rig)).not.toEqual(still);
    rig.update(plant('Harvestable', 1), 60_000, true);
    expect(meshes(rig).find((mesh) => mesh.userData.part === 'halo')!.visible).toBe(true); rig.dispose();
  });

  it('keeps the ripe halo visible with reduced motion across presentation times', () => {
    const { rig } = setup(); const halo = meshes(rig).find((mesh) => mesh.userData.part === 'halo')!;
    [0, 600, 60_000].forEach((nowMs) => {
      rig.update(plant('Harvestable', 1), nowMs, true);
      expect(halo.visible).toBe(true);
    });
    rig.dispose();
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
