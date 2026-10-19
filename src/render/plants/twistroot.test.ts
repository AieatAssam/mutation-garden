import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, Color, Mesh, MeshToonMaterial, Vector3, type Material } from 'three';
import type { PlantSnapshot } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { palette } from '../palette';
import { createTwistroot } from './twistroot';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const setup = () => { const library = createMaterialLibrary(); libraries.push(library); return { library, rig: createTwistroot(library) }; };
const plant = (stage: PlantSnapshot['stage'], progress: number): PlantSnapshot => ({ speciesId: 'twistroot', plantedAt: 0, stage, progress });
const meshes = (rig: ReturnType<typeof createTwistroot>) => {
  const result: Mesh[] = []; rig.root.traverse((object) => { if (object instanceof Mesh) result.push(object); }); return result;
};
const part = (rig: ReturnType<typeof createTwistroot>, name: string) => meshes(rig).find((mesh) => mesh.userData.part === name)!;
const positions = (rig: ReturnType<typeof createTwistroot>) => Array.from(part(rig, 'root-body').geometry.getAttribute('position').array);
const maxDelta = (left: readonly number[], right: readonly number[]) => Math.max(...left.map((value, index) => Math.abs(value - right[index]!)));

function measuredTurns(rig: ReturnType<typeof createTwistroot>): number {
  const attribute = part(rig, 'root-body').geometry.getAttribute('position');
  const ringCount = attribute.count / 10;
  const centers = Array.from({ length: ringCount }, (_, ring) => {
    let x = 0; let z = 0;
    for (let side = 0; side < 10; side += 1) {
      const index = ring * 10 + side;
      x += attribute.getX(index); z += attribute.getZ(index);
    }
    return [x / 10, z / 10] as const;
  });
  const axisX = centers.reduce((sum, center) => sum + center[0], 0) / centers.length;
  const axisZ = centers.reduce((sum, center) => sum + center[1], 0) / centers.length;
  const angles = centers.map(([x, z]) => Math.atan2(z - axisZ, x - axisX));
  let winding = 0;
  for (let index = 1; index < angles.length; index += 1) {
    let delta = angles[index]! - angles[index - 1]!;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    winding += delta;
  }
  return Math.abs(winding) / (Math.PI * 2);
}

describe('createTwistroot', () => {
  it('deforms one stable root through the species progress boundaries without visible jumps', () => {
    const { rig } = setup();
    const root = part(rig, 'root-body'); const geometry = root.geometry; const originalMeshes = meshes(rig);
    const boundaries = [0.12, 0.4, 0.88, 1];
    for (const boundary of boundaries) {
      rig.update(plant('Growing', boundary - 1e-5), 0, true);
      const before = positions(rig);
      rig.update(plant('Growing', boundary), 0, true);
      const at = positions(rig);
      rig.update(plant('Growing', Math.min(1, boundary + 1e-5)), 0, true);
      const after = positions(rig);
      expect(maxDelta(before, at)).toBeLessThan(0.002);
      expect(maxDelta(at, after)).toBeLessThan(0.002);
      expect(part(rig, 'root-body').geometry).toBe(geometry);
      expect(meshes(rig)).toEqual(originalMeshes);
    }
    rig.update(plant('Sprout', 0.12), 0, true); const sprout = positions(rig);
    rig.update(plant('Growing', 0.4), 0, true); const growing = positions(rig);
    rig.update(plant('Mature', 0.88), 0, true); const mature = positions(rig);
    rig.update(plant('Harvestable', 1), 0, true); const ripe = positions(rig);
    expect(maxDelta(sprout, growing)).toBeGreaterThan(0.01);
    expect(maxDelta(growing, mature)).toBeGreaterThan(0.01);
    expect(maxDelta(mature, ripe)).toBeGreaterThan(0.001);
    rig.dispose();
  });

  it('forms 2–3 turns from the rendered root-body vertex centers at full growth', () => {
    const { rig } = setup();
    rig.update(plant('Harvestable', 1), 0, true);
    const body = part(rig, 'root-body');
    expect(body.geometry.getAttribute('position').count).toBe(410);
    const turns = measuredTurns(rig);
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(turns).toBeLessThanOrEqual(3);
    rig.dispose();
  });

  it('keeps upper turns full and cross-sections rounded perpendicular to the bend', () => {
    const { rig } = setup();
    rig.update(plant('Harvestable', 1), 0, true);
    const attribute = part(rig, 'root-body').geometry.getAttribute('position');
    const ring = 30;
    const start = ring * 10;
    const center = [0, 0, 0];
    for (let side = 0; side < 10; side += 1) {
      center[0]! += attribute.getX(start + side) / 10;
      center[1]! += attribute.getY(start + side) / 10;
      center[2]! += attribute.getZ(start + side) / 10;
    }
    const radii = Array.from({ length: 10 }, (_, side) => {
      const index = start + side;
      return Math.hypot(attribute.getX(index) - center[0]!, attribute.getY(index) - center[1]!, attribute.getZ(index) - center[2]!);
    });
    expect(Math.min(...radii)).toBeGreaterThan(0.09);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);

    const angle = (ring / 40) * 2.5 * Math.PI * 2;
    const tangent = [-0.2 * 2.5 * Math.PI * 2 * Math.sin(angle), 0.78, 0.2 * 2.5 * Math.PI * 2 * Math.cos(angle)];
    const tangentLength = Math.hypot(...tangent);
    const normals = part(rig, 'root-body').geometry.getAttribute('normal');
    for (let side = 0; side < 10; side += 1) {
      const index = start + side;
      const radial = [attribute.getX(index) - center[0]!, attribute.getY(index) - center[1]!, attribute.getZ(index) - center[2]!];
      const tangentDot = Math.abs(radial.reduce((sum, value, axis) => sum + value * tangent[axis]! / tangentLength, 0));
      expect(tangentDot).toBeLessThan(1e-6);
      const normal = [normals.getX(index), normals.getY(index), normals.getZ(index)];
      expect(normal.reduce((sum, value, axis) => sum + value * radial[axis]!, 0)).toBeGreaterThan(0);
    }
    rig.dispose();
  });

  it('keeps the sage tuft and soil bulge visible with continuous tuft growth', () => {
    const { rig } = setup();
    rig.update(plant('Harvestable', 1), 0, true);
    const soil = part(rig, 'soil-bulge');
    const leaves = part(rig, 'tuft-leaf');
    const body = part(rig, 'root-body');
    expect(soil.visible).toBe(true);
    expect(leaves.visible).toBe(true);
    expect(body.visible).toBe(true);
    expect((soil.material as MeshToonMaterial).color).toEqual(new Color(palette.environment.soil[1]));
    expect((leaves.material as MeshToonMaterial).color).toEqual(new Color(palette.plants.twistroot.leaf[1]));
    expect((body.material as MeshToonMaterial).color).toEqual(new Color(palette.plants.twistroot.fruit[1]));
    rig.root.updateMatrixWorld(true);
    const soilBounds = new Box3().setFromObject(soil);
    const leafBounds = new Box3().setFromObject(leaves);
    const rootBounds = new Box3().setFromObject(body);
    expect(soilBounds.getSize(new Vector3()).x).toBeGreaterThan(0.5);
    expect(rootBounds.min.y).toBeLessThan(0.1);
    expect(rootBounds.max.y).toBeGreaterThan(0.8);
    expect(leafBounds.max.y).toBeGreaterThan(soilBounds.max.y);

    const tuft = leaves.parent!;
    for (const boundary of [0.2, 0.84]) {
      const scales: number[] = [];
      for (const progress of [boundary - 1e-5, boundary, boundary + 1e-5]) {
        rig.update(plant('Growing', progress), 0, true);
        scales.push(tuft.scale.x);
      }
      expect(Math.abs(scales[1]! - scales[0]!)).toBeLessThan(1e-6);
      expect(Math.abs(scales[2]! - scales[1]!)).toBeLessThan(1e-6);
    }
    rig.dispose();
  });

  it('clamps progress and keeps same-progress poses stable in reduced motion', () => {
    const { rig } = setup();
    rig.update(plant('Growing', 0), 0, true); const atZero = positions(rig);
    rig.update(plant('Growing', -1), 60_000, true); expect(positions(rig)).toEqual(atZero);
    rig.update(plant('Mature', 1), 0, true); const atFull = positions(rig);
    rig.update(plant('Harvestable', 2), 60_000, true); expect(positions(rig)).toEqual(atFull);
    const pose = () => {
      rig.root.updateMatrixWorld(true);
      return meshes(rig).flatMap((mesh) => mesh.matrixWorld.toArray());
    };
    rig.update(plant('Harvestable', 1), 0, true); const still = pose();
    rig.update(plant('Harvestable', 1), 60_000, true); expect(pose()).toEqual(still);
    const halo = part(rig, 'ripe-halo');
    for (const stage of ['Seed', 'Sprout', 'Growing', 'Mature'] as const) {
      rig.update(plant(stage, 1), 60_000, true);
      expect(halo.visible).toBe(false);
    }
    rig.update(plant('Harvestable', 1), 60_000, true);
    expect(halo.visible).toBe(true);
    rig.dispose();
  });

  it('disposes owned geometry once without disposing borrowed outline or material resources', () => {
    const { rig } = setup(); const all = meshes(rig);
    const bodyGeometry = part(rig, 'root-body').geometry;
    const geometryDispose = vi.spyOn(bodyGeometry, 'dispose');
    expect(part(rig, 'root-outline').geometry).toBe(bodyGeometry);
    const ownedGeometries = [...new Set(all.filter((mesh) => mesh.userData.part !== 'blob' && mesh.userData.part !== 'root-outline').map((mesh) => mesh.geometry))];
    const ownedDisposals = ownedGeometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    const blob = part(rig, 'blob'); const blobGeometryDispose = vi.spyOn(blob.geometry, 'dispose');
    const haloMaterial = part(rig, 'ripe-halo').material as Material;
    const haloMaterialDispose = vi.spyOn(haloMaterial, 'dispose');
    const borrowedMaterials = [...new Set(all.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
      .filter((material) => material !== haloMaterial).map((material) => vi.spyOn(material, 'dispose'));
    rig.dispose(); rig.dispose();
    ownedDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(haloMaterialDispose).toHaveBeenCalledTimes(1);
    expect(blobGeometryDispose).not.toHaveBeenCalled();
    borrowedMaterials.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
  });
});
