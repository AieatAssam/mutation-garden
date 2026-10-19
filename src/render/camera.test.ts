import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { createGardenCamera, panGardenCamera, resizeGardenCamera } from './camera';
import { createGarden } from './garden';
import { createMaterialLibrary } from './materials';

describe('garden camera', () => {
  const screenPoint = (camera: ReturnType<typeof createGardenCamera>, point = new Vector3(0, 0.65, 0)) => {
    camera.updateMatrixWorld(true);
    const projected = point.clone().project(camera);
    return [projected.x, projected.y] as const;
  };

  const pose = (camera: ReturnType<typeof createGardenCamera>) => ({
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    frustum: [camera.left, camera.right, camera.top, camera.bottom],
  });

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

  it('keeps framing unchanged for a zero pan', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    const beforePose = pose(camera);
    const beforePoint = screenPoint(camera);

    panGardenCamera(camera, 0, 0);

    expect(pose(camera)).toEqual(beforePose);
    expect(screenPoint(camera)).toEqual(beforePoint);
  });

  it('moves the garden in the same direction as positive CSS drag deltas', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    const before = screenPoint(camera);

    panGardenCamera(camera, 36, 0);
    const afterHorizontalDrag = screenPoint(camera);
    expect(afterHorizontalDrag[0]).toBeGreaterThan(before[0]);
    expect(afterHorizontalDrag[1]).toBeCloseTo(before[1], 8);

    panGardenCamera(camera, 0, 28);
    const afterVerticalDrag = screenPoint(camera);
    expect(afterVerticalDrag[0]).toBeCloseTo(afterHorizontalDrag[0], 8);
    // NDC y is inverted from CSS y, so dragging down moves the garden lower on screen.
    expect(afterVerticalDrag[1]).toBeLessThan(afterHorizontalDrag[1]);
  });

  it('keeps the existing horizontal pan continuous across the vertical clamp threshold', () => {
    const cameraBeforeThreshold = createGardenCamera();
    const cameraAtThreshold = createGardenCamera();
    resizeGardenCamera(cameraBeforeThreshold, 390, 844);
    resizeGardenCamera(cameraAtThreshold, 390, 844);
    panGardenCamera(cameraBeforeThreshold, 36, 0);
    panGardenCamera(cameraAtThreshold, 36, 0);

    panGardenCamera(cameraBeforeThreshold, 0, 239);
    panGardenCamera(cameraAtThreshold, 0, 240);

    const xBeforeThreshold = screenPoint(cameraBeforeThreshold)[0];
    const xAtThreshold = screenPoint(cameraAtThreshold)[0];
    expect(Math.abs(xAtThreshold - xBeforeThreshold)).toBeLessThan(0.0025);
  });

  it('clamps large pans to a finite bound and ignores invalid input', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    panGardenCamera(camera, 1e9, 1e9);
    const clampedPose = pose(camera);
    const clampedPoint = screenPoint(camera);

    panGardenCamera(camera, 1e9, 1e9);
    expect(pose(camera)).toEqual(clampedPose);
    expect(screenPoint(camera)).toEqual(clampedPoint);
    expect([...camera.position.toArray(), ...camera.quaternion.toArray(), ...clampedPoint].every(Number.isFinite)).toBe(true);

    for (const [dx, dy] of [[NaN, 2], [2, Infinity]] as const) {
      panGardenCamera(camera, dx, dy);
      expect(pose(camera)).toEqual(clampedPose);
    }
    panGardenCamera(camera, 2, 2, 0, 844);
    expect(pose(camera)).toEqual(clampedPose);
    panGardenCamera(camera, 2, 2, 390, Infinity);
    expect(pose(camera)).toEqual(clampedPose);
    for (const [width, height] of [[0, 844], [390, -1], [NaN, 844], [390, Infinity]] as const) {
      resizeGardenCamera(camera, width, height);
      expect(pose(camera)).toEqual(clampedPose);
    }
  });

  it('retains a valid pan through portrait and landscape resize, reclamping at the edge', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    panGardenCamera(camera, 28, -18);

    resizeGardenCamera(camera, 1280, 800);
    const resizedPoint = screenPoint(camera);
    const landscapeBase = createGardenCamera();
    resizeGardenCamera(landscapeBase, 1280, 800);
    expect(screenPoint(landscapeBase)).not.toEqual(resizedPoint);
    expect([...camera.position.toArray(), ...resizedPoint].every(Number.isFinite)).toBe(true);

    panGardenCamera(camera, -1e9, -1e9);
    resizeGardenCamera(camera, 390, 844);
    expect([...camera.position.toArray(), ...screenPoint(camera)].every(Number.isFinite)).toBe(true);
    panGardenCamera(camera, -1e9, -1e9);
    const portraitBase = createGardenCamera();
    resizeGardenCamera(portraitBase, 390, 844);
    const saturatedCamera = createGardenCamera();
    resizeGardenCamera(saturatedCamera, 390, 844);
    panGardenCamera(saturatedCamera, -1e9, -1e9);
    expect(camera.position.distanceTo(portraitBase.position))
      .toBeLessThanOrEqual(saturatedCamera.position.distanceTo(portraitBase.position) + 1e-7);
    expect([...camera.position.toArray(), ...screenPoint(camera)].every(Number.isFinite)).toBe(true);
  });
});
