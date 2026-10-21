import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
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
  it('starts empty and exposes five instanced status passes outside plant roots', () => {
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
    expect(stamp.geometry.getAttribute('uv').count).toBe(stamp.geometry.getAttribute('position').count);
    expect(stamp.geometry.getAttribute('instanceStatusOpacity').count).toBe(MAX_STATUS_PLOTS);
    expect(stamp.geometry.getAttribute('statusStampPart')).toBeUndefined();
    expect(stamp.material).toMatchObject({ customProgramCacheKey: expect.any(Function) });
    expect((stamp.material as { customProgramCacheKey: () => string }).customProgramCacheKey()).toBe('plot-status-stamp-v1');
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    const compileShader = (stamp.material as MeshBasicMaterial).onBeforeCompile as unknown as (program: typeof shader) => void;
    compileShader(shader);
    expect(shader.fragmentShader.match(/diffuseColor\.a \*= vStatusStampOpacity/g)).toHaveLength(1);
    expect(shader.fragmentShader).toContain('stampLeafContains(vStatusStampPoint)');
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

  it('keeps the dial peg vertical, pitches the dial face, and keeps the stamp billboarded', () => {
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
    const dialFacing = new Quaternion().multiplyQuaternions(
      facing,
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -35 * Math.PI / 180),
    );
    expect(rotationOf('plot-status-dial-face').angleTo(dialFacing)).toBeCloseTo(0);
    expect(rotationOf('plot-status-stamp-face').angleTo(facing)).toBeCloseTo(0);

    const dial = meshes(status).find((candidate) => candidate.name === 'plot-status-dial-face')!;
    const colors = dial.geometry.getAttribute('color');
    const positions = dial.geometry.getAttribute('position');
    const wood = palette.environment['wood-crate'].map((color) => new Color(color));
    const instanceMatrix = new Matrix4();
    dial.getMatrixAt(0, instanceMatrix);
    const pegPoints: Vector3[] = [];
    for (let index = 0; index < positions.count; index += 1) {
      const color = new Color(colors.getX(index), colors.getY(index), colors.getZ(index));
      const isWood = wood.some((woodColor) => Math.max(
        Math.abs(woodColor.r - color.r), Math.abs(woodColor.g - color.g), Math.abs(woodColor.b - color.b),
      ) < 1e-4);
      if (!isWood) continue;
      pegPoints.push(new Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)).applyMatrix4(instanceMatrix));
    }
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    pegPoints.forEach((point) => { min.min(point); max.max(point); });
    expect(max.x - min.x).toBeCloseTo(0.07, 2);
    expect(max.y - min.y).toBeCloseTo(0.12, 2);
    expect(max.z - min.z).toBeCloseTo(0.07, 2);
    const pegCenter = min.clone().add(max).multiplyScalar(0.5);
    const dialLowerEdge = base.dial!.center.clone().add(new Vector3(0, -0.2, 0).applyQuaternion(dialFacing));
    expect(pegCenter.y).toBeCloseTo(dialLowerEdge.y - 0.06);
  });

  it('applies transition scale and stamp opacity through bounded instance attributes', () => {
    const status = create();
    const base = descriptor('0', 1);
    status.update([{
      ...base,
      dialScale: 1.15,
      stamp: { ...base.stamp!, scale: 0.8, opacity: 0.4 },
    }]);
    const mesh = (name: string) => meshes(status).find((candidate) => candidate.name === name)!;
    const getScale = (name: string) => {
      const matrix = new Matrix4();
      const scale = new Vector3();
      mesh(name).getMatrixAt(0, matrix);
      matrix.decompose(new Vector3(), new Quaternion(), scale);
      return scale.x;
    };
    expect(getScale('plot-status-dial-face')).toBeCloseTo(0.2 * 1.15);
    expect(getScale('plot-status-stamp-face')).toBeCloseTo(0.31 * 0.8);
    const stamp = mesh('plot-status-stamp-face');
    const shadow = mesh('plot-status-stamp-shadow');
    expect(stamp.geometry.getAttribute('instanceStatusOpacity').getX(0)).toBeCloseTo(0.4);
    expect(shadow.geometry.getAttribute('instanceStatusOpacity').getX(0)).toBeCloseTo(0.4);
    expect(stamp.material).toMatchObject({ transparent: true, depthTest: false, depthWrite: false });
    expect(shadow.material).toMatchObject({ transparent: true, depthTest: false, depthWrite: false });
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
