import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from './camera';
import { createGarden } from './garden';
import { createMaterialLibrary } from './materials';

describe('garden camera', () => {
  it.each([
    [360, 800, 800 / 48, [10.5, 12.5, 17], [0, 1.3, 0]],
    [390, 844, 844 / 48, [10.5, 12.5, 17], [0, 1.3, 0]],
    [390, 896, 18.2, [10.5, 12.5, 17], [0, 1.3, 0]],
    [844, 390, 7.8, [10.5, 6.8, 14], [-2.6, -1.3, 0]],
    [1280, 800, 9, [10.5, 6.8, 14], [-2.6, -1.3, 0]],
  ] as const)(
    'keeps the three-quarter camera and plot framing at %ix%i', (width, height, expectedHeight, position, target) => {
      const camera = createGardenCamera();
      resizeGardenCamera(camera, width, height);
      expect(camera.top - camera.bottom).toBeCloseTo(expectedHeight, 10);
      expect(camera.right - camera.left).toBeCloseTo(expectedHeight * width / height, 10);
      expect(camera.position.toArray()).toEqual([...position]);
      const expectedDirection = new Vector3(...target).sub(new Vector3(...position)).normalize();
      const direction = camera.getWorldDirection(new Vector3());
      expect(direction.x).toBeCloseTo(expectedDirection.x, 10);
      expect(direction.y).toBeCloseTo(expectedDirection.y, 10);
      expect(direction.z).toBeCloseTo(expectedDirection.z, 10);

      const rowZ = [2, 0, -2];
      const plotCenters = rowZ.flatMap((z) => [-1.05, 1.05].map((x) => new Vector3(x, 0.65, z).project(camera)));
      expect(plotCenters).toHaveLength(6);
      for (const center of plotCenters) {
        expect(center.x, 'plot center remains inside the horizontal view').toBeGreaterThan(-0.95);
        expect(center.x, 'plot center remains inside the horizontal view').toBeLessThan(0.95);
        expect(center.y, 'plot center remains inside the vertical view').toBeGreaterThan(-0.95);
        expect(center.y, 'plot center remains inside the vertical view').toBeLessThan(0.95);
      }
    },
  );

  it('fills the portrait frame with the island while keeping the garden in view on desktop', () => {
    const materials = createMaterialLibrary();
    const garden = createGarden(materials);
    garden.updateMatrixWorld(true);
    const island = garden.children.find((object): object is Mesh => object instanceof Mesh &&
      object.userData.aoBaked === true && object.userData.role !== 'plot-bed');
    expect(island).toBeDefined();
    const positions = island!.geometry.getAttribute('position');
    for (const [width, height, portrait] of [[390, 844, true], [1280, 800, false]] as const) {
      const camera = createGardenCamera();
      resizeGardenCamera(camera, width, height);
      camera.updateMatrixWorld(true);
      const projected = Array.from({ length: positions.count }, (_, index) =>
        new Vector3().fromBufferAttribute(positions, index).applyMatrix4(island!.matrixWorld).project(camera));
      const minX = Math.min(...projected.map(({ x }) => x));
      const maxX = Math.max(...projected.map(({ x }) => x));
      const minY = Math.min(...projected.map(({ y }) => y));
      const maxY = Math.max(...projected.map(({ y }) => y));

      expect(minX).toBeGreaterThan(-1);
      expect(maxX).toBeLessThan(1);
      expect(minY).toBeGreaterThan(-1);
      expect(maxY).toBeLessThan(1);
      if (portrait) {
        // The issue target is about 85% of the viewport width: NDC spans 2 units.
        expect(maxX - minX).toBeGreaterThanOrEqual(1.6);
        expect(maxX - minX).toBeLessThanOrEqual(1.8);
      }
    }
    garden.dispose();
    materials.dispose();
  });
});
