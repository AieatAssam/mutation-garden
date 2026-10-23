import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from './camera';
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
    zoom: camera.zoom,
  });

  it.each([
    [360, 800, 6.2 * 800 / 360, [3.6, 8.5, 11], [0.35, 0.2, 0.3]],
    [390, 844, 6.2 * 844 / 390, [3.6, 8.5, 11], [0.35, 0.2, 0.3]],
    [390, 896, 6.2 * 896 / 390, [3.6, 8.5, 11], [0.35, 0.2, 0.3]],
    [844, 390, 390 / 56, [3.6, 8.5, 11], [0.35, 1.2, 0.3]],
    [1280, 800, 9.4, [3.6, 8.5, 11], [0.35, 1.2, 0.3]],
  ] as const)(
    'keeps the three-quarter camera and plot framing at %ix%i', (width, height, expectedHeight, position, target) => {
      const camera = createGardenCamera();
      resizeGardenCamera(camera, width, height);
      expect(camera.top - camera.bottom).toBeCloseTo(expectedHeight, 10);
      expect(camera.right - camera.left).toBeCloseTo(expectedHeight * width / height, 10);
      // Short landscape slides the view up so back-row stamps clear the top HUD row; the view direction is unchanged.
      if (height >= 600) expect(camera.position.toArray()).toEqual([...position]);
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

  it.each([[390, 844], [1280, 800]] as const)(
    'keeps every plot center inside the horizontal pan envelope at %ix%i', (width, height) => {
      const materials = createMaterialLibrary();
      const garden = createGarden();
      const camera = createGardenCamera();
      resizeGardenCamera(camera, width, height);
      const centers = () => {
        camera.updateMatrixWorld(true);
        garden.updateMatrixWorld(true);
        return garden.plots.map((plot) => {
          const projected = plot.getWorldPosition(new Vector3()).project(camera);
          return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
        });
      };
      const before = centers();

      for (const deltaX of [-1e9, 1e9]) {
        panGardenCamera(camera, deltaX, 0);
        const atBound = centers();
        expect(atBound).toHaveLength(6);
        expect(atBound.some((point, index) => Math.abs(point.x - before[index]!.x) > 1)).toBe(true);
        for (const [index, point] of atBound.entries()) {
          expect(point.x, `plot-${index} left target edge`).toBeGreaterThanOrEqual(8 - 1e-6);
          expect(point.x, `plot-${index} right target edge`).toBeLessThanOrEqual(width - 8 + 1e-6);
        }
      }
      garden.dispose();
      materials.dispose();
    },
  );

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

  it('keeps horizontal pan responsive after reaching the vertical distance limit', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    panGardenCamera(camera, 0, 1e9);
    const atVerticalLimit = screenPoint(camera)[0];

    panGardenCamera(camera, 20, 0);

    expect(screenPoint(camera)[0]).toBeGreaterThan(atVerticalLimit);
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

  it('clamps zoom to the supported range and saturates repeated zoom commands', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);

    zoomGardenCamera(camera, 1e100);
    // On a phone the limit is where back-row stamps would reach the objective line, about 1.22.
    expect(camera.zoom).toBeGreaterThan(1.2);
    expect(camera.zoom).toBeLessThanOrEqual(1.35);
    const maxPose = pose(camera);
    zoomGardenCamera(camera, 1e100);
    expect(pose(camera)).toEqual(maxPose);

    zoomGardenCamera(camera, 1e-100);
    expect(camera.zoom).toBeCloseTo(1, 10);
    const minPose = pose(camera);
    zoomGardenCamera(camera, 1e-100);
    expect(pose(camera)).toEqual(minPose);
  });

  it('ignores invalid zoom scales and safely clamps extreme finite scales', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    zoomGardenCamera(camera, 1.2);
    const beforeInvalidScales = pose(camera);

    for (const scale of [NaN, Infinity, -Infinity, 0, -1]) {
      zoomGardenCamera(camera, scale);
      expect(pose(camera), `scale ${scale} leaves camera unchanged`).toEqual(beforeInvalidScales);
    }
    zoomGardenCamera(camera, Number.MIN_VALUE);
    expect(camera.zoom).toBeCloseTo(1, 10);
    zoomGardenCamera(camera, 1.2);
    const maximum = createGardenCamera();
    resizeGardenCamera(maximum, 390, 844);
    zoomGardenCamera(maximum, 1e100);
    zoomGardenCamera(camera, Number.MAX_VALUE);
    expect(camera.zoom).toBeCloseTo(maximum.zoom, 10);
    expect([...camera.position.toArray(), camera.zoom].every(Number.isFinite)).toBe(true);

    zoomGardenCamera(camera, 1 / Number.MAX_VALUE);
    expect(camera.zoom).toBeCloseTo(1, 10);
    expect([...camera.position.toArray(), camera.zoom].every(Number.isFinite)).toBe(true);
  });

  it.each([[0, -1e9], [0, 1e9]] as const)('keeps every plot on screen after a vertical pan (%s, %s) and a full zoom', (dx, dy) => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    panGardenCamera(camera, dx, dy);
    zoomGardenCamera(camera, 1e100);
    panGardenCamera(camera, dx, dy);
    camera.updateMatrixWorld(true);
    for (const [x, z] of [[-1.05, 2], [1.05, 2], [-1.05, 0], [1.05, 0], [-1.05, -2], [1.05, -2]]) {
      const y = (1 - new Vector3(x, 0.65, z).project(camera).y) * 844 / 2;
      expect(y).toBeGreaterThanOrEqual(32 - 1e-6);
      expect(y).toBeLessThanOrEqual(844 - 32 + 1e-6);
    }
  });

  it('responds immediately when zoom reverses after reaching a limit', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    zoomGardenCamera(camera, 100);
    const maximum = camera.zoom;
    expect(maximum).toBeGreaterThan(1.2);

    zoomGardenCamera(camera, 0.9);

    expect(camera.zoom).toBeCloseTo(maximum * 0.9, 10);
  });

  it.each([
    [1, 390, 844], [1, 1280, 800],
    [1.35, 390, 844], [1.35, 1280, 800],
  ] as const)(
    'keeps zoom-aware pan within horizontal target bounds at zoom %s on %sx%s', (requestedZoom, width, height) => {
      const camera = createGardenCamera();
      resizeGardenCamera(camera, width, height);
      zoomGardenCamera(camera, requestedZoom);
      const projectedX = () => {
        camera.updateMatrixWorld(true);
        return [[-1.05, 0.65, 2], [1.05, 0.65, 2], [-1.05, 0.65, 0], [1.05, 0.65, 0],
          [-1.05, 0.65, -2], [1.05, 0.65, -2]].map((point) =>
          (new Vector3(point[0], point[1], point[2]).project(camera).x + 1) * width / 2);
      };
      const start = projectedX();

      for (const dx of [-1e9, 1e9]) {
        panGardenCamera(camera, dx, 0, width, height);
        const atEdge = projectedX();
        expect(atEdge.some((x, index) => Math.abs(x - start[index]!) > 1)).toBe(true);
        for (const x of atEdge) {
          expect(x - 24).toBeGreaterThanOrEqual(8 - 1e-5);
          expect(x + 24).toBeLessThanOrEqual(width - 8 + 1e-5);
        }
      }
    },
  );

  it('preserves a valid zoom across phone, landscape and desktop resize sizes', () => {
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 390, 844);
    zoomGardenCamera(camera, 1.2);

    // Short landscape has no room to zoom: back-row stamps would reach the HUD row.
    for (const [width, height, zoom] of [[360, 800, 1.2], [390, 844, 1.2], [1280, 800, 1.2], [844, 390, 1]] as const) {
      resizeGardenCamera(camera, width, height);
      expect(camera.zoom, `${width}x${height}`).toBeCloseTo(zoom, 2);
      expect([...camera.position.toArray(), camera.zoom].every(Number.isFinite)).toBe(true);
    }
  });

  it('preserves zoom that fits after a landscape to narrow-portrait resize', () => {
    const width = 320;
    const camera = createGardenCamera();
    resizeGardenCamera(camera, 1280, 800);
    zoomGardenCamera(camera, 1.3);
    // Desktop caps zoom near 1.19 so back-row stamps stay below the top HUD row; narrow portrait keeps it.
    const desktopZoom = camera.zoom;
    expect(desktopZoom).toBeLessThan(1.3);
    resizeGardenCamera(camera, width, 800);

    expect(camera.zoom).toBeCloseTo(desktopZoom, 10);
    const targetXs = () => {
      camera.updateMatrixWorld(true);
      return [[-1.05, 0.65, 2], [1.05, 0.65, 2], [-1.05, 0.65, 0], [1.05, 0.65, 0],
        [-1.05, 0.65, -2], [1.05, 0.65, -2]].map(([x, y, z]) =>
        (new Vector3(x, y, z).project(camera).x + 1) * width / 2);
    };

    for (const deltaX of [-1e9, 1e9]) {
      panGardenCamera(camera, deltaX, 0, width, 800);
      for (const x of targetXs()) {
        expect(x - 24).toBeGreaterThanOrEqual(8 - 1e-5);
        expect(x + 24).toBeLessThanOrEqual(width - 8 + 1e-5);
      }
    }
  });
});
