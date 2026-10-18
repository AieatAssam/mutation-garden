import { describe, expect, it } from 'vitest';
import { createGardenCamera, resizeGardenCamera } from './camera';

describe('garden camera', () => {
  it.each([[360, 800, 800 / 61.5], [390, 844, 13.5], [390, 896, 13.5], [844, 390, 7], [1280, 800, 7]])(
    'fits the picking envelope at %ix%i', (width, height, expectedHeight) => {
      const camera = createGardenCamera();
      resizeGardenCamera(camera, width, height);
      expect(camera.top - camera.bottom).toBeCloseTo(expectedHeight, 10);
      expect(camera.right - camera.left).toBeCloseTo(expectedHeight * width / height, 10);
      expect(camera.position.x).toBe(width / height < 1 ? 0 : 8);
      expect(camera.position.y).toBe(6);
      expect(camera.position.z).toBe(14);
    },
  );
});
