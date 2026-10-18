import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createGardenCamera, resizeGardenCamera } from './camera';

describe('garden camera', () => {
  it.each([
    [360, 800, 800 / 48, [10.5, 10, 17], [0, -1.6, 0]],
    [390, 844, 16.7, [10.5, 10, 17], [0, -1.6, 0]],
    [390, 896, 16.7, [10.5, 10, 17], [0, -1.6, 0]],
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
      const plotCenters = rowZ.flatMap((z) => [-1.05, 1.05].map((x) => new Vector3(x, 0.58, z).project(camera)));
      expect(plotCenters).toHaveLength(6);
      for (const center of plotCenters) {
        expect(center.x, 'plot center remains inside the horizontal view').toBeGreaterThan(-0.95);
        expect(center.x, 'plot center remains inside the horizontal view').toBeLessThan(0.95);
        expect(center.y, 'plot center remains inside the vertical view').toBeGreaterThan(-0.95);
        expect(center.y, 'plot center remains inside the vertical view').toBeLessThan(0.95);
      }
    },
  );
});
