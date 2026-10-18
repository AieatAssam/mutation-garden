import { describe, expect, it } from 'vitest';
import { createGardenCamera, resizeGardenCamera } from './camera';

describe('garden camera', () => {
  it.each([[390, 844], [390, 896], [360, 800]])('keeps portrait framing envelope at %ix%i', (width, height) => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, width, height);
    expect(camera.top - camera.bottom).toBe(13.5);
    expect(camera.right - camera.left).toBeCloseTo(13.5 * width / height, 10);
    expect(camera.position.x).toBe(0);
    expect(camera.position.y).toBe(6);
    expect(camera.position.z).toBe(14);
  });
});
