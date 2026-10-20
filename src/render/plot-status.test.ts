import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlotStatusResources, MAX_STATUS_PLOTS, PLOT_STATUS_DRAW_CALLS, type PlotStatusDescriptor } from './plot-status';
import { palette } from './palette';

const resources: ReturnType<typeof createPlotStatusResources>[] = [];
function create() {
  const value = createPlotStatusResources();
  resources.push(value);
  return value;
}

afterEach(() => resources.splice(0).forEach((value) => value.dispose()));

function meshes(status: ReturnType<typeof createPlotStatusResources>): InstancedMesh[] {
  return status.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
}

function descriptor(plotId: string, progress: number): PlotStatusDescriptor {
  return {
    plotId,
    dial: {
      center: new Vector3(Number(plotId), 1, 0),
      progress,
      color: palette.plants['sunny-sprout'].fruit[1],
      stageFractions: [0.2, 0.55, 0.9],
    },
    stamp: { center: new Vector3(Number(plotId), 2, 0), color: palette.plants['sunny-sprout'].fruit[1] },
  };
}

describe('plot status render resources', () => {
  it('starts empty and exposes separate instanced passes outside plant roots', () => {
    const status = create();
    expect(status.group.name).toBe('plot-status');
    expect(status.group.children).toHaveLength(5);
    expect(meshes(status).every((mesh) => mesh.count === 0)).toBe(true);
  });

  it('writes progress to the matching instance and clamps its fill fraction', () => {
    const status = create();
    status.update([descriptor('1', 0.35), descriptor('2', 1.4)]);
    const pie = meshes(status).find((mesh) => mesh.name === 'plot-status-dial-fill')!;
    const fill = pie.geometry.getAttribute('instanceProgress');
    expect(pie.count).toBe(2);
    expect(fill.getX(0)).toBeCloseTo(0.35);
    expect(fill.getX(1)).toBe(1);
    expect(pie.instanceColor).not.toBeNull();
  });

  it('builds the outlined paper ring and leaf-tick glyph in stamp face geometry', () => {
    const status = create();
    const stamp = meshes(status).find((mesh) => mesh.name === 'plot-status-stamp-face')!;
    const part = stamp.geometry.getAttribute('statusStampPart');
    const parts = new Set(Array.from({ length: part.count }, (_, index) => part.getX(index)));
    expect(parts).toEqual(new Set([0, 1, 2]));
    expect(part.count).toBe(stamp.geometry.getAttribute('position').count);
    expect(stamp.material).toMatchObject({ customProgramCacheKey: expect.any(Function) });
    expect((stamp.material as { customProgramCacheKey: () => string }).customProgramCacheKey()).toBe('plot-status-stamp-v1');
  });

  it('draws stamp passes over the scene without depth testing or writes', () => {
    const status = create();
    const shadow = meshes(status).find((mesh) => mesh.name === 'plot-status-stamp-shadow')!;
    const stamp = meshes(status).find((mesh) => mesh.name === 'plot-status-stamp-face')!;
    expect(shadow.renderOrder).toBeLessThan(stamp.renderOrder);
    expect(shadow.material).toMatchObject({ depthTest: false, depthWrite: false });
    expect(stamp.material).toMatchObject({ depthTest: false, depthWrite: false });
  });

  it('refreshes instance bounds when descriptors move and when they are removed', () => {
    const status = create();
    status.update([descriptor('10', 0.5)]);
    const stamp = meshes(status).find((mesh) => mesh.name === 'plot-status-stamp-face')!;
    const ticks = meshes(status).find((mesh) => mesh.name === 'plot-status-dial-ticks')!;
    expect(stamp.boundingSphere?.center.x).toBeCloseTo(10);
    expect(ticks.geometry.boundingSphere?.radius).toBe(1);
    expect(ticks.boundingSphere?.radius).toBeCloseTo(0.2);

    status.update([descriptor('-10', 0.5)]);
    expect(stamp.boundingSphere?.center.x).toBeCloseTo(-10);

    status.update([]);
    expect(stamp.count).toBe(0);
  });

  it('applies the caller-supplied billboard orientation to both status faces', () => {
    const status = create();
    const facing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3);
    const base = descriptor('0', 0.5);
    status.update([{
      ...base,
      dial: { ...base.dial!, facing },
      stamp: { ...base.stamp!, facing },
    }]);
    const rotationOf = (name: string) => {
      const mesh = meshes(status).find((candidate) => candidate.name === name)!;
      const matrix = new Matrix4();
      const rotation = new Quaternion();
      mesh.getMatrixAt(0, matrix);
      matrix.decompose(new Vector3(), rotation, new Vector3());
      return rotation;
    };
    expect(rotationOf('plot-status-dial-face').angleTo(facing)).toBeCloseTo(0);
    expect(rotationOf('plot-status-stamp-face').angleTo(facing)).toBeCloseTo(0);
  });

  it('keeps six plots within the five-pass draw-call budget', () => {
    const status = create();
    status.update(Array.from({ length: MAX_STATUS_PLOTS }, (_, index) => descriptor(String(index), index / 5)));
    // Each visible InstancedMesh is one renderer pass, independent of instance count.
    const visiblePasses = meshes(status).filter((mesh) => mesh.count > 0);
    expect(visiblePasses.map((mesh) => mesh.name)).toEqual([
      'plot-status-dial-face',
      'plot-status-dial-fill',
      'plot-status-dial-ticks',
      'plot-status-stamp-shadow',
      'plot-status-stamp-face',
    ]);
    expect(visiblePasses).toHaveLength(PLOT_STATUS_DRAW_CALLS);
    expect(PLOT_STATUS_DRAW_CALLS).toBeLessThan(150);
  });

  it('rejects more than six plot descriptors rather than growing resources', () => {
    const status = create();
    expect(() => status.update(Array.from({ length: MAX_STATUS_PLOTS + 1 }, (_, index) => descriptor(String(index), 0.5))))
      .toThrow(RangeError);
  });

  it('disposes each owned geometry and material exactly once', () => {
    const status = create();
    const geometries = meshes(status).map(({ geometry }) => geometry);
    const materials = meshes(status).flatMap(({ material }) => Array.isArray(material) ? material : [material]);
    const geometryDispose = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDispose = materials.map((material) => vi.spyOn(material, 'dispose'));
    status.dispose();
    status.dispose();
    geometryDispose.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDispose.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });
});
