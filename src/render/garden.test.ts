import { BufferGeometry, Color, InstancedMesh, Mesh, MeshToonMaterial, type Material } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGarden } from './garden';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const makeLibrary = () => {
  const library = createMaterialLibrary();
  libraries.push(library);
  return library;
};

describe('createGarden', () => {
  it('exposes six stable anchors in the two-column, three-row bed layout', () => {
    const garden = createGarden(makeLibrary());
    const anchors = garden.plots;
    expect(anchors.map(({ plotId }) => plotId)).toEqual([
      'plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5',
    ]);
    expect(new Set(anchors.map(({ plotId }) => plotId)).size).toBe(6);
    expect(garden.plots).toBe(anchors);
    expect(anchors.map(({ position }) => position.toArray())).toEqual([
      [-1.05, 0.58, 2], [1.05, 0.58, 2],
      [-1.05, 0.58, 0], [1.05, 0.58, 0],
      [-1.05, 0.58, -2], [1.05, 0.58, -2],
    ]);
  });

  it('builds six outlined soil beds with baked edge occlusion', () => {
    const library = makeLibrary();
    const garden = createGarden(library);
    const beds: Mesh[] = [];
    garden.traverse((object) => {
      if (object instanceof Mesh && object.userData.role === 'plot-bed') beds.push(object);
    });

    expect(beds).toHaveLength(6);
    expect(beds.map((bed) => bed.userData.plotId)).toEqual([
      'plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5',
    ]);
    for (const bed of beds) {
      expect(bed.name).toBe('plot-bed');
      expect(bed.userData.aoBaked).toBe(true);
      expect((bed.material as MeshToonMaterial).vertexColors).toBe(true);
      const colors = bed.geometry.getAttribute('color');
      expect(colors).toBeDefined();
      const shades = new Set(Array.from({ length: colors.count }, (_, index) =>
        [colors.getX(index), colors.getY(index), colors.getZ(index)].map((value) => value.toFixed(3)).join(',')));
      expect(shades.size).toBeGreaterThan(1);
      expect(bed.geometry.getAttribute('position').count).toBe(colors.count);
    }

    const bedMaterial = beds[0]!.material as MeshToonMaterial;
    const sourceBedMaterial = library.toon(palette.environment.soil[1]!);
    expect(bedMaterial).not.toBe(sourceBedMaterial);
    expect(bedMaterial.onBeforeCompile).toBe(sourceBedMaterial.onBeforeCompile);
    expect(bedMaterial.customProgramCacheKey).toBe(sourceBedMaterial.customProgramCacheKey);
  });

  it('instances three warm soil furrows per bed and bakes occlusion into the island edge', () => {
    const library = makeLibrary();
    const garden = createGarden(library);
    const furrows: InstancedMesh[] = [];
    const aoMeshes: Mesh[] = [];
    garden.traverse((object) => {
      if (object instanceof InstancedMesh && object.userData.role === 'plot-furrows') furrows.push(object);
      if (object instanceof Mesh && object.userData.aoBaked === true) aoMeshes.push(object);
    });

    expect(furrows).toHaveLength(1);
    expect(furrows[0]!.name).toBe('plot-furrows');
    expect(furrows[0]!.count).toBe(18);
    expect(furrows[0]!.userData.furrowsPerPlot).toBe(3);
    expect((furrows[0]!.material as MeshToonMaterial).color.getHexString())
      .toBe(new Color(palette.environment.soil[0]!).getHexString());
    furrows[0]!.geometry.computeBoundingBox();
    expect(furrows[0]!.geometry.boundingBox!.max.x - furrows[0]!.geometry.boundingBox!.min.x)
      .toBeGreaterThan(furrows[0]!.geometry.boundingBox!.max.y - furrows[0]!.geometry.boundingBox!.min.y);

    expect(aoMeshes.some((mesh) => mesh.name === 'plot-bed')).toBe(true);
    const island = aoMeshes.find((mesh) => mesh.name !== 'plot-bed');
    expect(island).toBeDefined();
    const grassMaterial = island!.material as MeshToonMaterial;
    const sourceGrassMaterial = library.toon(palette.environment.grass[2]!);
    expect(grassMaterial).not.toBe(sourceGrassMaterial);
    expect(grassMaterial.onBeforeCompile).toBe(sourceGrassMaterial.onBeforeCompile);
    expect(grassMaterial.customProgramCacheKey).toBe(sourceGrassMaterial.customProgramCacheKey);
    expect(island!.geometry.getAttribute('color')).toBeDefined();
    const islandColors = island!.geometry.getAttribute('color');
    expect(islandColors.count).toBe(island!.geometry.getAttribute('position').count);
    expect(new Set(Array.from({ length: islandColors.count }, (_, index) => islandColors.getY(index).toFixed(3))).size)
      .toBeGreaterThan(1);
  });

  it('does not dispose attached geometry during construction', () => {
    const disposed = new Set<BufferGeometry>();
    const original = BufferGeometry.prototype.dispose;
    const spy = vi.spyOn(BufferGeometry.prototype, 'dispose').mockImplementation(function (this: BufferGeometry) {
      disposed.add(this);
      original.call(this);
    });
    let garden: ReturnType<typeof createGarden> | undefined;
    try {
      garden = createGarden(makeLibrary());
      const attached = new Set<BufferGeometry>();
      garden.traverse((object) => { if (object instanceof Mesh) attached.add(object.geometry); });
      expect([...attached].some((geometry) => disposed.has(geometry))).toBe(false);
    } finally {
      spy.mockRestore();
      garden?.dispose();
    }
  });

  it('disposes owned resources once and keeps borrowed resources alive', () => {
    const library = makeLibrary();
    const blob = library.blob();
    const garden = createGarden(library);
    const meshes: Mesh[] = [];
    garden.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    const geometries = new Set(meshes.filter(({ geometry }) => geometry !== blob.geometry).map(({ geometry }) => geometry));
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const sky = meshes.find(({ name }) => name.startsWith('day-sky'));
    if (!sky) throw new Error('Garden sky mesh is missing');
    const skySpy = vi.spyOn(sky.material as Material, 'dispose');
    const furrows = meshes.find(({ name }) => name === 'plot-furrows');
    if (!(furrows instanceof InstancedMesh)) throw new Error('Garden furrows instance is missing');
    const furrowsSpy = vi.spyOn(furrows, 'dispose');
    const sceneMaterials = new Set(meshes.flatMap(({ material }) => Array.isArray(material) ? material : [material]));
    const ownedMaterials = new Set([...sceneMaterials].filter((material) =>
      material instanceof MeshToonMaterial && material.vertexColors));
    const ownedMaterialSpies = [...ownedMaterials].map((material) => vi.spyOn(material, 'dispose'));
    const borrowed = new Set([...sceneMaterials].filter((material) =>
      material !== sky.material && !ownedMaterials.has(material)));
    const borrowedSpies = [...borrowed].map((material) => vi.spyOn(material, 'dispose'));
    const blobGeometrySpy = vi.spyOn(blob.geometry, 'dispose');

    garden.dispose();
    garden.dispose();
    geometrySpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(skySpy).toHaveBeenCalledTimes(1);
    expect(furrowsSpy).toHaveBeenCalledTimes(1);
    expect(ownedMaterials.size).toBe(2);
    ownedMaterialSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    borrowedSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(blobGeometrySpy).not.toHaveBeenCalled();
  });
});
