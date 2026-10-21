import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, Color, InstancedMesh, Matrix4, Mesh, MeshToonMaterial, Quaternion, Vector3, type Material } from 'three';
import type { PlantSnapshot } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { palette } from '../palette';
import { createBubbleBerry } from './bubble-berry';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const setup = (hopPhaseOffsetMs = 0) => { const library = createMaterialLibrary(); libraries.push(library); return { library, rig: createBubbleBerry(library, 0, hopPhaseOffsetMs) }; };
const plant = (stage: PlantSnapshot['stage'], progress: number): PlantSnapshot => ({ speciesId: 'bubble-berry', plantedAt: 0, stage, progress });
const meshes = (rig: ReturnType<typeof createBubbleBerry>) => {
  const result: Mesh[] = []; rig.root.traverse((object) => { if (object instanceof Mesh) result.push(object); }); return result;
};
const part = (rig: ReturnType<typeof createBubbleBerry>, name: string) => meshes(rig).find((mesh) => mesh.userData.part === name)!;
const instanceScaleY = (mesh: InstancedMesh, index: number) => {
  const matrix = new Matrix4(); const scale = new Vector3();
  mesh.getMatrixAt(index, matrix); matrix.decompose(new Vector3(), new Quaternion(), scale);
  return scale.y / scale.x;
};
const meshBounds = (mesh: Mesh) => {
  mesh.geometry.computeBoundingBox();
  const geometryBounds = mesh.geometry.boundingBox!;
  if (!(mesh instanceof InstancedMesh)) return new Box3().copy(geometryBounds).applyMatrix4(mesh.matrixWorld);
  const instanceMatrix = new Matrix4(); const worldMatrix = new Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, instanceMatrix);
    worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
    return new Box3().copy(geometryBounds).applyMatrix4(worldMatrix);
  }).reduce((bounds, instanceBounds) => bounds.union(instanceBounds), new Box3());
};
const plantBounds = (rig: ReturnType<typeof createBubbleBerry>) => {
  rig.root.updateMatrixWorld(true);
  return meshes(rig).filter((mesh) => mesh.userData.part !== 'blob' && !String(mesh.userData.part).endsWith('outline'))
    .reduce((bounds, mesh) => bounds.union(meshBounds(mesh)), new Box3());
};

describe('createBubbleBerry', () => {
  it('grows the dome and berries and unfurls leaves smoothly through the stages', () => {
    const { rig } = setup(); const original = meshes(rig); const stages: PlantSnapshot['stage'][] = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];
    const leaves = part(rig, 'leaves'); const dome = part(rig, 'dome');
    const berryCluster = rig.root.getObjectByName('berry-cluster')!; const sample = (progress: number, stage: PlantSnapshot['stage'] = 'Growing') => {
      rig.update(plant(stage, progress), 0, true); rig.root.updateMatrixWorld(true);
      const domeBounds = new Box3().setFromObject(dome);
      const leafBounds = new Box3().setFromObject(leaves);
      return {
        domeSize: dome.scale.x,
        berrySize: berryCluster.scale.y,
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
    expect(all.filter((mesh) => mesh.userData.part === 'halo')).toHaveLength(0);
    expect(berries.userData.berryCount).toBeGreaterThanOrEqual(4);
    expect(berries.userData.berryCount).toBeLessThanOrEqual(6);
    expect(highlights.userData.highlightCount).toBeGreaterThanOrEqual(berries.userData.berryCount);
    rig.dispose();
  });

  it('warms fruit in linear space and changes the ripe silhouette by at least eight percent', () => {
    const { rig } = setup(); const berries = part(rig, 'berries');
    rig.update(plant('Growing', 0.4), 0, true);
    expect((berries.material as MeshToonMaterial).color).toEqual(new Color(palette.plants['bubble-berry'].fruit[3]));
    rig.update(plant('Mature', 0.95), 0, true); const mature = plantBounds(rig).getSize(new Vector3());
    rig.update(plant('Harvestable', 1), 0, true);
    expect((berries.material as MeshToonMaterial).color).toEqual(new Color(palette.plants['bubble-berry'].fruit[1]));
    const ripe = plantBounds(rig).getSize(new Vector3());
    expect(Math.max((ripe.x - mature.x) / mature.x, (ripe.y - mature.y) / mature.y)).toBeGreaterThanOrEqual(0.08);
    rig.dispose();
  });

  it('measures berry bounds from their instance matrices instead of the unscaled sphere template', () => {
    const { rig } = setup(); rig.update(plant('Harvestable', 1), 0, true); rig.root.updateMatrixWorld(true);
    const berries = part(rig, 'berries') as InstancedMesh;
    const bounds = meshBounds(berries);
    const expected = new Box3(); const geometryBounds = berries.geometry.boundingBox!;
    const instance = new Matrix4(); const world = new Matrix4();
    for (let index = 0; index < berries.count; index += 1) {
      berries.getMatrixAt(index, instance);
      world.multiplyMatrices(berries.matrixWorld, instance);
      expected.union(new Box3().copy(geometryBounds).applyMatrix4(world));
    }
    expect(bounds.min.toArray()).toEqual(expected.min.toArray());
    expect(bounds.max.toArray()).toEqual(expected.max.toArray());
    expect(bounds.getSize(new Vector3()).x).toBeLessThan(1.5);
    rig.dispose();
  });

  it('uses the authored default outline thickness when a material factory omits metadata', () => {
    const library = createMaterialLibrary(); libraries.push(library);
    const rig = createBubbleBerry({
      ...library,
      outline(geometry) {
        const outline = library.outline(geometry);
        delete outline.userData.outlineThickness;
        return outline;
      },
    });
    expect((part(rig, 'berries-outline') as InstancedMesh).userData.outlineThickness).toBe(0.035);
    rig.dispose();
  });

  it('hops by plot phase and jiggles berries individually with synchronized outlines', () => {
    const first = setup(0); const second = setup(500);
    const firstBody = first.rig.root.getObjectByName('plant-body')!;
    const secondBody = second.rig.root.getObjectByName('plant-body')!;
    first.rig.update(plant('Harvestable', 1), 360, false);
    second.rig.update(plant('Harvestable', 1), 2860, false);
    expect(firstBody.position.y).toBeCloseTo(0.05, 6);
    expect(secondBody.position.y).toBeCloseTo(0.05, 6);

    const firstBerries = part(first.rig, 'berries') as InstancedMesh;
    const firstOutlines = part(first.rig, 'berries-outline') as InstancedMesh;
    const outlineThickness = firstOutlines.userData.outlineThickness as number;
    expect(outlineThickness).toBe(0.035);
    first.rig.update(plant('Harvestable', 1), 550, false);
    expect(instanceScaleY(firstBerries, 0)).toBeCloseTo(0.92, 6);
    expect(instanceScaleY(firstBerries, 1)).toBe(1);
    first.rig.update(plant('Harvestable', 1), 610, false);
    expect(instanceScaleY(firstBerries, 0)).toBeCloseTo(1.06, 6);
    expect(instanceScaleY(firstBerries, 1)).toBeCloseTo(0.92, 6);
    for (let index = 0; index < firstBerries.count; index += 1) {
      const berryMatrix = new Matrix4(); const outlineMatrix = new Matrix4();
      firstBerries.getMatrixAt(index, berryMatrix); firstOutlines.getMatrixAt(index, outlineMatrix);
      const berryScale = new Vector3(); const outlineScale = new Vector3();
      berryMatrix.decompose(new Vector3(), new Quaternion(), berryScale);
      outlineMatrix.decompose(new Vector3(), new Quaternion(), outlineScale);
      expect(outlineScale.x * (1 + outlineThickness)).toBeCloseTo(berryScale.x + outlineThickness, 6);
      expect(outlineScale.y * (1 + outlineThickness)).toBeCloseTo(berryScale.y + outlineThickness, 6);
    }
    first.rig.dispose(); second.rig.dispose();
  });

  it('keeps breathing, the hop, and every berry jiggle still under reduced motion', () => {
    const { rig } = setup(); const berries = part(rig, 'berries') as InstancedMesh;
    rig.update(plant('Harvestable', 1), 550, true);
    expect(rig.root.getObjectByName('plant-body')!.position.y).toBe(0);
    expect(rig.root.getObjectByName('plant-body')!.scale.y).toBe(1);
    expect(rig.root.scale.y).toBe(1);
    const still = Array.from({ length: berries.count }, (_, index) => {
      const matrix = new Matrix4(); berries.getMatrixAt(index, matrix); return matrix.toArray();
    });
    rig.update(plant('Harvestable', 1), 2500, true);
    expect(Array.from({ length: berries.count }, (_, index) => {
      const matrix = new Matrix4(); berries.getMatrixAt(index, matrix); return matrix.toArray();
    })).toEqual(still);
    rig.dispose();
  });

  it('shrinks and restores the grounded blob shadow through the hop', () => {
    const { rig } = setup(); const blob = part(rig, 'blob');
    rig.update(plant('Harvestable', 1), 360, false);
    expect(blob.position.y * rig.root.scale.y).toBeCloseTo(0.008, 6);
    expect(blob.scale.x).toBeCloseTo(0.92 * 0.75, 6);
    rig.update(plant('Harvestable', 1), 520, false);
    expect(blob.scale.x).toBeCloseTo(0.92, 6);
    rig.dispose();
  });

  it('rotates each leaf 15 degrees outward and keeps the shared rim hook and ripe shader state', () => {
    const { rig } = setup(); const leaves = part(rig, 'leaves'); const berries = part(rig, 'berries');
    const positions = leaves.geometry.getAttribute('position'); const verticesPerLeaf = positions.count / 8;
    rig.update(plant('Mature', 0.95), 0, true);
    const original = Float32Array.from(positions.array);
    const leafSamples = Array.from({ length: 8 }, (_, leaf) => {
      const azimuth = leaf * Math.PI * 2 / 8;
      const hingeX = Math.sin(azimuth) * 0.23; const hingeZ = Math.cos(azimuth) * 0.23;
      const radial = (x: number, z: number) => (x - hingeX) * Math.sin(azimuth) + (z - hingeZ) * Math.cos(azimuth);
      let outermost = leaf * verticesPerLeaf; let largestRadius = -Infinity;
      for (let vertex = leaf * verticesPerLeaf; vertex < (leaf + 1) * verticesPerLeaf; vertex += 1) {
        const offset = vertex * 3;
        const radius = radial(original[offset]!, original[offset + 2]!);
        if (radius > largestRadius) { largestRadius = radius; outermost = vertex; }
      }
      const initial = Math.atan2(original[outermost * 3 + 1]! - 0.065, largestRadius);
      return { outermost, initial, radial };
    });
    rig.update(plant('Harvestable', 1), 0, true);
    leafSamples.forEach(({ outermost, initial, radial }) => {
      const opened = Math.atan2(positions.getY(outermost) - 0.065,
        radial(positions.getX(outermost), positions.getZ(outermost)));
      expect(opened - initial).toBeCloseTo(Math.PI / 12, 5);
    });

    const material = berries.material as MeshToonMaterial;
    const shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string } = {
      uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <opaque_fragment>',
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.uniforms).toHaveProperty('seedPacketRimColor');
    expect(shader.uniforms.seedPacketRipe).toEqual({ value: 1 });
    rig.dispose();
  });

  it('disposes owned geometry and fruit material once while preserving borrowed materials and blob resources', () => {
    const { rig } = setup(); const all = meshes(rig);
    const instances = all.filter((mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh);
    const instanceDisposals = instances.map((mesh) => vi.spyOn(mesh, 'dispose'));
    const geometries = [...new Set(all.filter((mesh) => mesh.userData.part !== 'blob').map((mesh) => mesh.geometry))]
      .map((geometry) => vi.spyOn(geometry, 'dispose'));
    const fruitMaterial = part(rig, 'berries').material; const fruitDispose = vi.spyOn(fruitMaterial as Material, 'dispose');
    const blobGeometry = vi.spyOn(part(rig, 'blob').geometry, 'dispose');
    const borrowed = [...new Set(all.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]))]
      .filter((material) => material !== fruitMaterial).map((material) => vi.spyOn(material, 'dispose'));
    rig.dispose(); rig.dispose(); geometries.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(fruitDispose).toHaveBeenCalledTimes(1); expect(blobGeometry).not.toHaveBeenCalled();
    instanceDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    borrowed.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
