import { BufferGeometry, Mesh, type Material } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGarden } from './garden';
import { createMaterialLibrary } from './materials';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
afterEach(() => libraries.splice(0).forEach((library) => library.dispose()));
const makeLibrary = () => {
  const library = createMaterialLibrary();
  libraries.push(library);
  return library;
};

describe('createGarden', () => {
  it('exposes six stable anchors in row order', () => {
    const garden = createGarden(makeLibrary());
    const anchors = garden.plots;
    expect(anchors.map(({ plotId }) => plotId)).toEqual([
      'plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5',
    ]);
    expect(new Set(anchors.map(({ plotId }) => plotId)).size).toBe(6);
    expect(garden.plots).toBe(anchors);
    expect(anchors.map(({ position }) => position.toArray())).toEqual([
      [-1, 0.58, 2], [1, 0.58, 2], [-1, 0.58, 0], [1, 0.58, 0], [-1, 0.58, -2], [1, 0.58, -2],
    ]);
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
    const borrowed = new Set(meshes.flatMap(({ material }) => Array.isArray(material) ? material : [material])
      .filter((material) => material !== sky.material));
    const borrowedSpies = [...borrowed].map((material) => vi.spyOn(material, 'dispose'));
    const blobGeometrySpy = vi.spyOn(blob.geometry, 'dispose');

    garden.dispose();
    garden.dispose();
    geometrySpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(skySpy).toHaveBeenCalledTimes(1);
    borrowedSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(blobGeometrySpy).not.toHaveBeenCalled();
  });
});
