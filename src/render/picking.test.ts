import { BufferGeometry, Material, Mesh, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGardenCamera, resizeGardenCamera } from './camera';
import { createGarden, type Garden } from './garden';
import { createMaterialLibrary } from './materials';
import { createGardenPicker } from './picking';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
const gardens: Garden[] = [];
afterEach(() => {
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

  it('rejects nonfinite, outside and empty-rect coordinates', () => {
    const { picker, rect } = setup();
    for (const [x, y] of [[NaN, 10], [10, Infinity], [-1, 10], [391, 10], [10, 845]] as const) {
      expect(picker.pick(x, y)).toBeNull();
    }
    rect.width = 0;
    expect(picker.pick(0, 10)).toBeNull();
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
