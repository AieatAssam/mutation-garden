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
    const ring = part(rig, 'growth-ring');
    for (const stage of ['Seed', 'Sprout', 'Growing', 'Mature'] as const) {
      rig.update(plant(stage, 1), 60_000, true);
      expect(ring.visible).toBe(false);
    }
    rig.update(plant('Harvestable', 1), 60_000, true);
    expect(ring.visible).toBe(true);
    rig.dispose();
  });

  it('warms the root body and applies the specified ripe emergence above the grounded soil', () => {
    const { rig } = setup(); const body = part(rig, 'root-body'); const soil = part(rig, 'soil-bulge');
    const tuft = rig.root.getObjectByName('tuft')!; const ring = part(rig, 'growth-ring');
    rig.update(plant('Growing', 0.4), 0, true);
    expect((body.material as MeshToonMaterial).color).toEqual(new Color(palette.plants.twistroot.fruit[3]));
    rig.update(plant('Growing', 0.75), 0, true);
    expect((body.material as MeshToonMaterial).color).toEqual(
      new Color(palette.plants.twistroot.fruit[3]).lerp(new Color(palette.plants.twistroot.fruit[1]), 0.5),
    );
    rig.update(plant('Mature', 0.95), 0, true);
    const matureTuftY = tuft.position.y;
    rig.root.updateMatrixWorld(true);
    const matureSoilTop = new Box3().setFromObject(soil).max.y;
    expect(body.position.y).toBe(0);
    rig.update(plant('Harvestable', 1), 0, true);
    expect((body.material as MeshToonMaterial).color).toEqual(new Color(palette.plants.twistroot.fruit[1]));
    rig.root.updateMatrixWorld(true);
    expect(body.position.y).toBeCloseTo(0.08, 6);
    expect(new Box3().setFromObject(soil).max.y).toBeCloseTo(matureSoilTop, 6);
    expect(tuft.position.y - matureTuftY).toBeGreaterThanOrEqual(0.08);
    expect(ring.visible).toBe(true);
    expect(ring.getWorldPosition(new Vector3()).y).toBeCloseTo(matureSoilTop + 0.03, 6);
    rig.dispose();
  });

  it('splays every tuft blade outward by the specified angle and keeps the shader and growth-ring centres aligned', () => {
    const { rig } = setup(); const leaves = part(rig, 'tuft-leaf'); const body = part(rig, 'root-body');
    const attribute = leaves.geometry.getAttribute('position'); const verticesPerLeaf = attribute.count / 7;
    const before = Float32Array.from(attribute.array);
    rig.update(plant('Mature', 0.95), 0, true);
    const closedTopIndices = Array.from({ length: 7 }, (_, leaf) => {
      let top = leaf * verticesPerLeaf;
      for (let vertex = top + 1; vertex < (leaf + 1) * verticesPerLeaf; vertex += 1) {
        if (before[vertex * 3 + 1]! > before[top * 3 + 1]!) top = vertex;
      }
      return top;
    });
    rig.update(plant('Harvestable', 1), 0, true);
    for (let leaf = 0; leaf < 7; leaf += 1) {
      const index = closedTopIndices[leaf]!;
      const azimuth = leaf * Math.PI * 2 / 7;
      const radial = (x: number, z: number) => x * Math.cos(azimuth) + z * Math.sin(azimuth);
      const initialAngle = Math.atan2(radial(before[index * 3]!, before[index * 3 + 2]!), before[index * 3 + 1]! - 0.12);
      const ripeAngle = Math.atan2(radial(attribute.getX(index), attribute.getZ(index)), attribute.getY(index) - 0.12);
      expect(ripeAngle - initialAngle).toBeCloseTo(Math.PI / 9, 5);
    }

    const material = body.material as MeshToonMaterial;
    const shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string } = {
      uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <opaque_fragment>',
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.uniforms).toHaveProperty('seedPacketRimColor');
    expect(shader.uniforms.seedPacketRipe).toEqual({ value: 1 });

    const ring = part(rig, 'growth-ring'); const outline = part(rig, 'growth-ring-outline');
    expect((ring.geometry as import('three').TorusGeometry).parameters).toMatchObject({ radius: 0.3, tube: 0.025 });
    expect(ring.position.toArray()).toEqual([0, 0.13, 0]);
    expect(outline.userData.outlineThickness).toBe(0.01);
    expect((ring.material as MeshToonMaterial).depthTest).toBe(true);
    expect((outline.material as Material).depthTest).toBe(true);
    rig.root.updateMatrixWorld(true);
    expect(ring.getWorldPosition(new Vector3()).distanceTo(outline.getWorldPosition(new Vector3()))).toBeLessThan(1e-9);
    expect(ring.getWorldPosition(new Vector3()).y).toBeCloseTo(0.13, 6);
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
    const rootMaterial = part(rig, 'root-body').material as Material;
    const rootMaterialDispose = vi.spyOn(rootMaterial, 'dispose');
    const borrowedMaterials = [...new Set(all.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
      .filter((material) => material !== rootMaterial).map((material) => vi.spyOn(material, 'dispose'));
    rig.dispose(); rig.dispose();
    ownedDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(rootMaterialDispose).toHaveBeenCalledTimes(1);
    expect(blobGeometryDispose).not.toHaveBeenCalled();
    borrowedMaterials.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
  });
});
