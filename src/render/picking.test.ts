import { BufferGeometry, Box3, Material, Mesh, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GardenSnapshot, PlantSnapshot } from '../sim';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from './camera';
import { createGarden, type Garden } from './garden';
import { createMaterialLibrary } from './materials';
import { createGardenPicker } from './picking';
import { createPlantReconciler, type PlantReconciler } from './plants/reconcile';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
const gardens: Garden[] = [];
const plantReconcilers: PlantReconciler[] = [];
afterEach(() => {
  plantReconcilers.splice(0).forEach((reconciler) => reconciler.dispose());
  gardens.splice(0).forEach((garden) => garden.dispose());
  libraries.splice(0).forEach((library) => library.dispose());
});

function setup(width = 390, height = 844) {
  const library = createMaterialLibrary(); libraries.push(library);
  const garden = createGarden(library); gardens.push(garden);
  const camera = createGardenCamera(); resizeGardenCamera(camera, width, height);
  const rect = { left: 0, top: 0, width, height };
  const picker = createGardenPicker({ getBoundingClientRect: () => rect as DOMRect }, camera, garden);
  const screen = (point: Vector3) => {
    camera.updateMatrixWorld(true); garden.updateMatrixWorld(true);
    const p = point.clone().project(camera);
    return [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2] as const;
  };
  const anchorScreen = (index: number) => screen(garden.plots[index]!.getWorldPosition(new Vector3()));
  return { camera, garden, picker, rect, screen, anchorScreen };
}

function addSunnyPlant(garden: Garden, stage: PlantSnapshot['stage'], progress: number): PlantReconciler {
  const library = libraries[libraries.length - 1]!;
  const reconciler = createPlantReconciler(garden.plots, library);
  plantReconcilers.push(reconciler);
  updateSunnyPlant(garden, reconciler, stage, progress);
  return reconciler;
}

function updateSunnyPlant(garden: Garden, reconciler: PlantReconciler, stage: PlantSnapshot['stage'], progress: number): void {
  const plant: PlantSnapshot = { speciesId: 'sunny-sprout', plantedAt: 0, stage, progress };
  const snapshot = {
    nowMs: 8_000,
    coins: 12,
    plots: garden.plots.map(({ plotId }) => ({ id: plotId, plant: plotId === 'plot-0' ? plant : null })),
  } as GardenSnapshot;
  reconciler.update(snapshot, snapshot, 1, true);
}

function addRipeTwistroot(garden: Garden): PlantReconciler {
  const library = libraries[libraries.length - 1]!;
  const reconciler = createPlantReconciler(garden.plots, library);
  plantReconcilers.push(reconciler);
  const plant: PlantSnapshot = { speciesId: 'twistroot', plantedAt: 0, stage: 'Harvestable', progress: 1 };
  const snapshot = {
    nowMs: 25_000,
    coins: 12,
    plots: garden.plots.map(({ plotId }) => ({ id: plotId, plant: plotId === 'plot-0' ? plant : null })),
  } as GardenSnapshot;
  reconciler.update(snapshot, snapshot, 1, true);
  garden.updateMatrixWorld(true);
  return reconciler;
}

function partCenter(garden: Garden, part: string): Vector3 {
  const anchor = garden.plots[0]!;
  let center: Vector3 | undefined;
  anchor.traverse((object) => {
    if (!(object instanceof Mesh) || object.userData.part !== part) return;
    object.geometry.computeBoundingBox();
    center = new Box3().copy(object.geometry.boundingBox!).getCenter(new Vector3());
    object.localToWorld(center);
  });
  if (!center) throw new Error(`Missing Sunny Sprout part: ${part}`);
  return center;
}

describe('garden picker', () => {
  it('raycasts all six stable plot anchors and their 48px squares across viewports', () => {
    for (const [width, height] of [[360, 800], [390, 844], [390, 896], [844, 390], [1280, 800]] as const) {
      const { picker, anchorScreen } = setup(width, height);
      for (let i = 0; i < 6; i += 1) {
        const [x, y] = anchorScreen(i);
        const expected = { kind: 'plot', plotId: `plot-${i}` };
        for (const [dx, dy] of [[0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24], [0, -24], [24, 0], [0, 24], [-24, 0]] as const) {
          expect(picker.pick(x + dx, y + dy), `${width}x${height} plot-${i} at ${dx},${dy}`).toEqual(expected);
        }
      }
      picker.dispose();
    }
  });

  it('picks exposed finite ground and excludes sky beyond its ellipse', () => {
    const { picker, screen } = setup();
    expect(picker.pick(...screen(new Vector3(0, 0.48, -3)))).toEqual({ kind: 'ground' });
    expect(picker.pick(...screen(new Vector3(0, 0.48, -4.8)))).toBeNull();
    picker.dispose();
  });

  it('uses fresh rect, camera and anchor matrices, even with hidden detached garden objects', () => {
    const { picker, camera, garden, rect, anchorScreen } = setup();
    const before = anchorScreen(0);
    garden.position.x = 0.7;
    garden.plots[0]!.position.x -= 0.25;
    garden.visible = false;
    garden.plots[0]!.visible = false;
    resizeGardenCamera(camera, 360, 800);
    Object.assign(rect, { left: 31, top: 47, width: 360, height: 800 });
    const [x, y] = anchorScreen(0);
    expect(picker.pick(x, y)).toEqual({ kind: 'plot', plotId: 'plot-0' });
    expect(picker.pick(before[0], before[1])).not.toEqual({ kind: 'plot', plotId: 'plot-0' });
    picker.dispose();
  });

  it('raycasts actual plot centers after the camera has been panned', () => {
    const { picker, camera, anchorScreen } = setup();
    const before = anchorScreen(0);

    panGardenCamera(camera, 72, 44);

    const after = anchorScreen(0);
    expect(after).not.toEqual(before);
    for (let i = 0; i < 6; i += 1) {
      const [x, y] = anchorScreen(i);
      expect(picker.pick(x, y)).toEqual({ kind: 'plot', plotId: `plot-${i}` });
    }
    picker.dispose();
  });

  it.each([[390, 844], [1280, 800]] as const)(
    'keeps all six 48px targets pickable at both horizontal pan limits on %ix%i', (width, height) => {
      const { camera, picker, anchorScreen } = setup(width, height);
      const before = Array.from({ length: 6 }, (_, index) => anchorScreen(index));
      const corners = [[0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24]] as const;

      for (const deltaX of [-1e9, 1e9]) {
        panGardenCamera(camera, deltaX, 0, width, height);
        for (let index = 0; index < 6; index += 1) {
          const [x, y] = anchorScreen(index);
          expect(Math.abs(x - before[index]![0]), `plot-${index} visibly moves`).toBeGreaterThan(1);
          for (const [dx, dy] of corners) {
            const px = x + dx;
            const py = y + dy;
            expect(px, `plot-${index} surface left edge`).toBeGreaterThanOrEqual(8 - 1e-6);
            expect(px, `plot-${index} surface right edge`).toBeLessThanOrEqual(width - 8 + 1e-6);
            expect(py, `plot-${index} surface top edge`).toBeGreaterThanOrEqual(0);
            expect(py, `plot-${index} surface bottom edge`).toBeLessThanOrEqual(height);
            expect(picker.pick(px, py), `${width}x${height} plot-${index} at ${dx},${dy}`)
              .toEqual({ kind: 'plot', plotId: `plot-${index}` });
          }
        }
      }
      picker.dispose();
    },
  );

  it.each([[360, 800], [390, 844], [844, 390], [1280, 800]] as const)(
    'picks all four corners of six accessible 48px plot targets at minimum and maximum zoom on %ix%i', (width, height) => {
      for (const requestedZoom of [1, 1.35]) {
        const { camera, picker, anchorScreen } = setup(width, height);
        zoomGardenCamera(camera, requestedZoom);

        for (const deltaX of [-1e9, 1e9]) {
          panGardenCamera(camera, deltaX, 0, width, height);
          for (let index = 0; index < 6; index += 1) {
            const [x, y] = anchorScreen(index);
            for (const [dx, dy] of [[-24, -24], [24, -24], [-24, 24], [24, 24]] as const) {
              const px = x + dx;
              const py = y + dy;
              expect(px, `${width}x${height} zoom ${requestedZoom} plot-${index} left corner edge`)
                .toBeGreaterThanOrEqual(8 - 1e-5);
              expect(px, `${width}x${height} zoom ${requestedZoom} plot-${index} right corner edge`)
                .toBeLessThanOrEqual(width - 8 + 1e-5);
              expect(picker.pick(px, py), `${width}x${height} zoom ${requestedZoom} plot-${index} corner ${dx},${dy}`)
                .toEqual({ kind: 'plot', plotId: `plot-${index}` });
            }
          }
        }
        picker.dispose();
      }
    },
  );

  it('picks visible Sunny plant geometry and resolves ripe fruit to its owning plot before an overlapping plot target', () => {
    const { picker, camera, garden, screen, anchorScreen } = setup();
    const reconciler = addSunnyPlant(garden, 'Growing', 0.6);
    const [stemX, stemY] = screen(partCenter(garden, 'stem'));
    expect(picker.pick(stemX, stemY)).toEqual({ kind: 'plot', plotId: 'plot-0' });

    updateSunnyPlant(garden, reconciler, 'Harvestable', 1);
    const fruit = partCenter(garden, 'fruit');
    const localFruit = garden.worldToLocal(fruit.clone().add(new Vector3(0, -0.08, 0)));
    garden.plots[1]!.position.copy(localFruit);
    camera.updateMatrixWorld(true);
    garden.updateMatrixWorld(true);
    const [fruitX, fruitY] = screen(fruit);
    const [ownerX, ownerY] = anchorScreen(0);
    expect(Math.hypot(fruitX - ownerX, fruitY - ownerY)).toBeGreaterThan(24);
    expect(picker.pick(fruitX, fruitY)).toEqual({ kind: 'plot', plotId: 'plot-0' });
    picker.dispose();
  });

  it.each([[390, 844], [1280, 800]] as const)(
    'ignores the transparent ripe Twistroot halo outside the plot target at %ix%i', (width, height) => {
      const { picker, garden, screen, anchorScreen } = setup(width, height);
      addRipeTwistroot(garden);
      const halo = garden.plots[0]!.getObjectByName('ripe-halo');
      expect(halo).toBeDefined();
      const [x, y] = screen(halo!.localToWorld(new Vector3(0.45, 0.45, 0)));
      const [anchorX, anchorY] = anchorScreen(0);
      expect(Math.max(Math.abs(x - anchorX), Math.abs(y - anchorY))).toBeGreaterThan(24);
      expect(picker.pick(x, y)).toEqual({ kind: 'ground' });
      picker.dispose();
    },
  );

  it('rejects nonfinite, outside and empty-rect coordinates', () => {
    const { picker, rect } = setup();
    for (const [x, y] of [[NaN, 10], [10, Infinity], [-1, 10], [391, 10], [10, 845]] as const) {
      expect(picker.pick(x, y)).toBeNull();
    }
    for (const invalidRect of [
      { left: NaN, top: 0, width: 390, height: 844 },
      { left: 0, top: Infinity, width: 390, height: 844 },
      { left: 0, top: 0, width: Infinity, height: 844 },
      { left: 0, top: 0, width: 390, height: NaN },
      { left: 0, top: 0, width: 0, height: 844 },
      { left: 0, top: 0, width: 390, height: -1 },
    ]) {
      Object.assign(rect, invalidRect);
      expect(picker.pick(10, 10)).toBeNull();
    }
    picker.dispose();
  });

  it('raycasts explicit targets only and returns null after disposal', () => {
    const { picker, garden, screen } = setup();
    const visual = new Vector3(2.25, 0.79, 0);
    expect(picker.pick(...screen(visual))).toEqual({ kind: 'ground' });
    expect(garden.children.some((child) => child instanceof Mesh && child.name.includes('pick'))).toBe(false);
    picker.dispose(); picker.dispose();
    expect(picker.pick(0, 0)).toBeNull();
  });

  it('disposes its two geometries and one material exactly once without disposing borrowed resources', () => {
    const { picker, garden } = setup();
    const borrowed: (BufferGeometry | Material)[] = [];
    garden.traverse((object) => { if (object instanceof Mesh) borrowed.push(object.geometry, object.material as Material); });
    const borrowedSpies = borrowed.map((resource) => vi.spyOn(resource, 'dispose'));
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(Material.prototype, 'dispose');
    picker.dispose(); picker.dispose();
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(material).toHaveBeenCalledTimes(1);
    borrowedSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    geometry.mockRestore(); material.mockRestore();
    borrowedSpies.forEach((spy) => spy.mockRestore());
  });
});
