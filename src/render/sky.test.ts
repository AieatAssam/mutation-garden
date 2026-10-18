import { Color } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDaySky } from './sky';
import { palette } from './palette';

describe('day sky', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the palette horizon, midpoint and zenith colors across both ramp halves', () => {
    const { mesh } = createDaySky();
    const colors = mesh.geometry.getAttribute('color');
    const positions = mesh.geometry.getAttribute('position');
    const colorAtY = (y: number) => {
      const vertex = Array.from({ length: positions.count }, (_, index) => index)
        .find((index) => positions.getY(index) === y);
      if (vertex === undefined) throw new Error(`Sky ramp has no vertex at y=${y}`);
      return new Color().fromBufferAttribute(colors, vertex);
    };
    const expectColor = (actual: Color, expected: Color) => {
      expect(actual.r).toBeCloseTo(expected.r, 5);
      expect(actual.g).toBeCloseTo(expected.g, 5);
      expect(actual.b).toBeCloseTo(expected.b, 5);
    };
    const endpoints = [0, positions.count - 1];
    endpoints.forEach((vertex) => {
      const expected = positions.getY(vertex) < 0
        ? palette.environment['sky-day'].horizon
        : palette.environment['sky-day'].zenith;
      expectColor(new Color().fromBufferAttribute(colors, vertex), new Color(expected));
    });
    const horizon = new Color(palette.environment['sky-day'].horizon);
    const mid = new Color(palette.environment['sky-day'].mid);
    const zenith = new Color(palette.environment['sky-day'].zenith);
    expectColor(colorAtY(0), mid);
    expectColor(colorAtY(-5), horizon.clone().lerp(mid, 0.5));
    expectColor(colorAtY(5), mid.clone().lerp(zenith, 0.5));
  });

  it('disposes owned geometry and material exactly once', () => {
    const { mesh, dispose } = createDaySky();
    const geometry = vi.spyOn(mesh.geometry, 'dispose');
    const material = vi.spyOn(mesh.material as { dispose: () => void }, 'dispose');
    dispose();
    dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
