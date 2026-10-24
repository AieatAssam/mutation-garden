import { BufferGeometry, Box3, Material, Mesh, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GardenSnapshot, PlantSnapshot } from '../sim';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, setGardenCameraExpanded, zoomGardenCamera } from './camera';
import { createGarden, type Garden } from './garden';
import { createMaterialLibrary } from './materials';
import { createGardenPicker } from './picking';
import type { StampPickDescriptor } from './plot-status-lifecycle';
import { createPlantReconciler, type PlantReconciler } from './plants/reconcile';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
const gardens: Garden[] = [];
const plantReconcilers: PlantReconciler[] = [];
afterEach(() => {
  plantReconcilers.splice(0).forEach((reconciler) => reconciler.dispose());
  gardens.splice(0).forEach((garden) => garden.dispose());
  libraries.splice(0).forEach((library) => library.dispose());
});

function setup(width = 390, height = 844, getStamps?: () => readonly StampPickDescriptor[]) {
  const library = createMaterialLibrary(); libraries.push(library);
  const garden = createGarden(); gardens.push(garden);
  const camera = createGardenCamera(); resizeGardenCamera(camera, width, height);
  const rect = { left: 0, top: 0, width, height };
  const picker = createGardenPicker({ getBoundingClientRect: () => rect as DOMRect }, camera, garden, getStamps);
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
    coins: 12, xp: 0, level: 1, levelStartXp: 0, nextLevelXp: 10,
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
    coins: 12, xp: 0, level: 1, levelStartXp: 0, nextLevelXp: 10,
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
    'keeps ripe Twistroot halo-free while its plot target remains pickable at %ix%i', (width, height) => {
      const { picker, garden, anchorScreen } = setup(width, height);
      addRipeTwistroot(garden);
      expect(garden.plots[0]!.getObjectByName('ripe-halo')).toBeUndefined();
      expect(picker.pick(...anchorScreen(0))).toEqual({ kind: 'plot', plotId: 'plot-0' });
      picker.dispose();
    },
  );

  it('preserves the old signature and lets an actual borrowed stamp disc win over a semantic plant', () => {
    const { picker, camera, garden, screen } = setup();
    addSunnyPlant(garden, 'Growing', 0.6);
    const stem = partCenter(garden, 'stem');
    const point = screen(stem);
    expect(picker.pick(...point)).toEqual({ kind: 'plot', plotId: 'plot-0' });

    const borrowed: StampPickDescriptor = {
      plotId: 'plot-1', center: stem.clone(), visibleDiameter: 0.5, opacity: 1, drawOrder: 0,
    };
    const pickerWithStamp = createGardenPicker(
      { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) as DOMRect },
      camera,
      garden,
      () => [borrowed],
    );
    expect(pickerWithStamp.pick(...point)).toEqual({ kind: 'plot', plotId: 'plot-1' });
    pickerWithStamp.dispose();

    const discDiameter = 0.12;
    const radiusX = discDiameter * camera.zoom * 390 / (camera.right - camera.left) / 2;
    const radiusY = discDiameter * camera.zoom * 844 / (camera.top - camera.bottom) / 2;
    const ellipseStamp = { ...borrowed, visibleDiameter: discDiameter };
    const ellipsePicker = createGardenPicker(
      { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) as DOMRect },
      camera,
      garden,
      () => [ellipseStamp],
    );
    expect(ellipsePicker.pick(point[0] + radiusX * 0.8, point[1] + radiusY * 0.3))
      .toEqual({ kind: 'plot', plotId: 'plot-1' });
    expect(ellipsePicker.pick(point[0] + radiusX * 0.8, point[1] + radiusY * 0.8))
      .toEqual({ kind: 'plot', plotId: 'plot-0' });
    ellipsePicker.dispose();

    const transparentSupplement = createGardenPicker(
      { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) as DOMRect },
      camera,
      garden,
      () => [{ ...borrowed, opacity: 0 }],
    );
    expect(transparentSupplement.pick(...point)).toEqual({ kind: 'plot', plotId: 'plot-0' });
    transparentSupplement.dispose();
    picker.dispose();
  });

  it('keeps the existing plot target ahead of a supplemental stamp square', () => {
    let stamps: readonly StampPickDescriptor[] = [];
    const { picker, garden, anchorScreen } = setup(390, 844, () => stamps);
    const center = garden.plots[0]!.getWorldPosition(new Vector3());
    stamps = [{ plotId: 'plot-1', center, visibleDiameter: 0, opacity: 1, drawOrder: 0 }];
    expect(picker.pick(...anchorScreen(0))).toEqual({ kind: 'plot', plotId: 'plot-0' });
    picker.dispose();

    const camera = createGardenCamera(); resizeGardenCamera(camera, 390, 844);
    const visibleDisc = createGardenPicker(
      { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) as DOMRect },
      camera,
      garden,
      () => [{ plotId: 'plot-1', center, visibleDiameter: 0.5, opacity: 1, drawOrder: 0 }],
    );
    expect(visibleDisc.pick(...anchorScreen(0))).toEqual({ kind: 'plot', plotId: 'plot-1' });
    visibleDisc.dispose();
  });

  it('uses last-drawn order for actual discs and nearest centre then draw order for supplements', () => {
    let stamps: readonly StampPickDescriptor[] = [];
    const { picker, screen } = setup(390, 844, () => stamps);
    const center = new Vector3(2.25, 0.79, 0);
    const descriptor = (plotId: string, x: number, diameter: number, drawOrder: number): StampPickDescriptor => ({
      plotId: plotId as StampPickDescriptor['plotId'],
      center: new Vector3(x, center.y, center.z),
      visibleDiameter: diameter,
      opacity: 1,
      drawOrder,
    });

    stamps = [descriptor('plot-1', center.x, 0.8, 1), descriptor('plot-0', center.x, 0.8, 0)];
    expect(picker.pick(...screen(center))).toEqual({ kind: 'plot', plotId: 'plot-1' });

    stamps = [descriptor('plot-0', center.x - 0.1, 0, 2), descriptor('plot-1', center.x + 0.1, 0, 5)];
    const [centerX, centerY] = screen(center);
    const [nearLeftX] = screen(new Vector3(center.x - 0.06, center.y, center.z));
    expect(picker.pick(nearLeftX, centerY)).toEqual({ kind: 'plot', plotId: 'plot-0' });
    expect(picker.pick(centerX, centerY)).toEqual({ kind: 'plot', plotId: 'plot-1' });

    stamps = [descriptor('plot-0', center.x, 0, 6), descriptor('plot-1', center.x, 0, 7)];
    expect(picker.pick(centerX, centerY)).toEqual({ kind: 'plot', plotId: 'plot-1' });
    picker.dispose();
  });

  it('uses square 48px and projected large-stamp supplemental bounds', () => {
    let stamps: readonly StampPickDescriptor[] = [];
    const { picker, camera, rect, screen } = setup(390, 844, () => stamps);
    const center = new Vector3(2.25, 0.79, 0);
    stamps = [{ plotId: 'plot-4', center, visibleDiameter: 0, opacity: 0, drawOrder: 0 }];
    const [x, y] = screen(center);
    expect(picker.pick(x + 24 - 0.1, y)).toEqual({ kind: 'plot', plotId: 'plot-4' });
    expect(picker.pick(x + 24 + 0.1, y)).not.toEqual({ kind: 'plot', plotId: 'plot-4' });

    const largeDiameter = 1.2;
    const diameterX = largeDiameter * camera.zoom * rect.width / (camera.right - camera.left);
    const diameterY = largeDiameter * camera.zoom * rect.height / (camera.top - camera.bottom);
    const side = Math.max(48, diameterX, diameterY);
    expect(side).toBeGreaterThan(48);
    stamps = [{ plotId: 'plot-5', center, visibleDiameter: largeDiameter, opacity: 0, drawOrder: 0 }];
    expect(picker.pick(x, y + side / 2 - 0.1)).toEqual({ kind: 'plot', plotId: 'plot-5' });
    expect(picker.pick(x, y + side / 2 + 0.1)).not.toEqual({ kind: 'plot', plotId: 'plot-5' });
    picker.dispose();
  });

  it('keeps supplemental targets square under nonuniform CSS projection', () => {
    let stamps: readonly StampPickDescriptor[] = [];
    const { picker, rect, screen } = setup(390, 844, () => stamps);
    Object.assign(rect, { width: 1560 });
    const center = new Vector3(2.25, 0.79, 0);
    const diameter = 0.4;
    stamps = [{ plotId: 'plot-3', center, visibleDiameter: diameter, opacity: 0, drawOrder: 0 }];
    const [x, y] = screen(center);
    expect(picker.pick(x, y + 30)).toEqual({ kind: 'plot', plotId: 'plot-3' });
    expect(picker.pick(x, y + 55)).not.toEqual({ kind: 'plot', plotId: 'plot-3' });
    picker.dispose();
  });

  it('refreshes stamp projection and descriptors per pick across zoom, resize and offset rect changes', () => {
    let stamps: readonly StampPickDescriptor[] = [];
    let providerCalls = 0;
    const { picker, camera, rect, screen } = setup(390, 844, () => { providerCalls += 1; return stamps; });
    const center = new Vector3(0.25, 1.3, 0.15);
    stamps = [{ plotId: 'plot-4', center, visibleDiameter: 0, opacity: 0, drawOrder: 0 }];
    const before = screen(center);
    expect(picker.pick(...before)).toEqual({ kind: 'plot', plotId: 'plot-4' });

    zoomGardenCamera(camera, 1.25);
    resizeGardenCamera(camera, 360, 800);
    Object.assign(rect, { left: 29, top: 41, width: 360, height: 800 });
    const after = screen(center);
    expect(after).not.toEqual(before);
    expect(picker.pick(...after)).toEqual({ kind: 'plot', plotId: 'plot-4' });
    stamps = [];
    expect(picker.pick(...after)).not.toEqual({ kind: 'plot', plotId: 'plot-4' });
    expect(providerCalls).toBe(3);
    picker.dispose();
  });

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

  it('picks a bed anywhere on its footprint, beyond the 48px minimum target', () => {
    const { garden, picker, screen } = setup();
    garden.plots.filter(({ userData }) => userData.locked !== true).forEach((anchor) => {
      for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) {
        const [x, y] = screen(anchor.localToWorld(new Vector3(dx, 0, dz)));
        expect(picker.pick(x, y), `${anchor.plotId} corner ${dx},${dz}`).toEqual({ kind: 'plot', plotId: anchor.plotId });
      }
    });
  });

  it('picks west plots after expansion is purchased', () => {
    const { camera, garden, picker, screen } = setup();
    setGardenCameraExpanded(camera, true);
    garden.plots.slice(6).forEach((plot) => { plot.visible = true; plot.userData.locked = false; });
    const plot = garden.plots[6]!;
    const [x, y] = screen(plot.localToWorld(new Vector3(0.8, 0, 0.8)));
    expect(picker.pick(x, y)).toEqual({ kind: 'plot', plotId: 'plot-6' });
  });

  it('disposes its three geometries and one material exactly once without disposing borrowed resources', () => {
    const { picker, garden } = setup();
    const borrowed: (BufferGeometry | Material)[] = [];
    garden.traverse((object) => { if (object instanceof Mesh) borrowed.push(object.geometry, object.material as Material); });
    const borrowedSpies = borrowed.map((resource) => vi.spyOn(resource, 'dispose'));
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(Material.prototype, 'dispose');
    picker.dispose(); picker.dispose();
    expect(geometry).toHaveBeenCalledTimes(3);
    expect(material).toHaveBeenCalledTimes(1);
    borrowedSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    geometry.mockRestore(); material.mockRestore();
    borrowedSpies.forEach((spy) => spy.mockRestore());
  });
});
