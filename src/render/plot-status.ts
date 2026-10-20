import {
  CircleGeometry,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Sphere,
  Vector3,
} from 'three';
import type { ColorRepresentation } from 'three';
import { palette } from './palette';

export const MAX_STATUS_PLOTS = 6;
export const PLOT_STATUS_DRAW_CALLS = 5;
const DIAL_RADIUS = 0.2;
const STAMP_RADIUS = 0.31;
export const PLOT_STATUS_STAMP_DIAMETER = STAMP_RADIUS * 2;

export interface PlotStatusDescriptor {
  readonly plotId: string;
  readonly dial?: {
    readonly center: Vector3;
    readonly progress: number;
    readonly color: ColorRepresentation;
    readonly stageFractions: readonly [number, number, number];
    readonly facing?: Quaternion;
  };
  readonly stamp?: {
    readonly center: Vector3;
    readonly color: ColorRepresentation;
    readonly facing?: Quaternion;
  };
}

export interface PlotStatusResources {
  /** Kept separate from all plant roots; add this group directly to the render scene. */
  readonly group: Group;
  /** Replaces the bounded set of visible plot status descriptors. */
  update(descriptors: readonly PlotStatusDescriptor[]): void;
  /** Releases owned geometry and materials once; safe to repeat. */
  dispose(): void;
}

function material(color: ColorRepresentation): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, toneMapped: false });
}

function createPieGeometry(): CircleGeometry {
  const geometry = new CircleGeometry(1, 48);
  geometry.setAttribute('instanceProgress', new InstancedBufferAttribute(new Float32Array(MAX_STATUS_PLOTS), 1));
  return geometry;
}

function createPieMaterial(): MeshBasicMaterial {
  const value = material(palette.ink['paper-white']);
  value.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float instanceProgress;\nvarying vec2 statusUv;\nvarying float statusProgress;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nstatusUv = uv - vec2(0.5);\nstatusProgress = instanceProgress;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec2 statusUv;\nvarying float statusProgress;',
    ).replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nfloat statusAngle = mod(atan(statusUv.x, statusUv.y) + 6.2831853, 6.2831853) / 6.2831853;\nif (statusAngle > statusProgress) discard;',
    );
  };
  value.customProgramCacheKey = () => 'plot-status-pie-v1';
  return value;
}

function createDialFaceGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const ink = new Color(palette.ink['press-ink']);
  const paper = new Color(palette.ink['paper-white']);
  function disc(radius: number, z: number, color: Color): void {
    const segments = 48;
    for (let segment = 0; segment < segments; segment += 1) {
      const a = (segment / segments) * Math.PI * 2;
      const b = ((segment + 1) / segments) * Math.PI * 2;
      positions.push(0, 0, z, Math.cos(a) * radius, Math.sin(a) * radius, z, Math.cos(b) * radius, Math.sin(b) * radius, z);
      for (let vertex = 0; vertex < 3; vertex += 1) colors.push(color.r, color.g, color.b);
    }
  }
  disc(1, 0, ink);
  disc(0.88, 0.006, paper);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createStampFaceGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const parts: number[] = [];
  function triangle(a: Vector3, b: Vector3, c: Vector3, part: number): void {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    parts.push(part, part, part);
  }
  function disc(radius: number, z: number, part: number): void {
    for (let segment = 0; segment < 48; segment += 1) {
      const a = (segment / 48) * Math.PI * 2;
      const b = ((segment + 1) / 48) * Math.PI * 2;
      triangle(new Vector3(0, 0, z), new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z), new Vector3(Math.cos(b) * radius, Math.sin(b) * radius, z), part);
    }
  }
  function ring(outer: number, inner: number, z: number, part: number): void {
    for (let segment = 0; segment < 48; segment += 1) {
      const a = (segment / 48) * Math.PI * 2;
      const b = ((segment + 1) / 48) * Math.PI * 2;
      const outsideA = new Vector3(Math.cos(a) * outer, Math.sin(a) * outer, z);
      const outsideB = new Vector3(Math.cos(b) * outer, Math.sin(b) * outer, z);
      const insideA = new Vector3(Math.cos(a) * inner, Math.sin(a) * inner, z);
      const insideB = new Vector3(Math.cos(b) * inner, Math.sin(b) * inner, z);
      triangle(outsideA, outsideB, insideB, part);
      triangle(outsideA, insideB, insideA, part);
    }
  }
  function roundCap(x: number, y: number, radius: number, part: number): void {
    const center = new Vector3(x, y, 0.01);
    for (let segment = 0; segment < 12; segment += 1) {
      const a = (segment / 12) * Math.PI * 2;
      const b = ((segment + 1) / 12) * Math.PI * 2;
      triangle(center,
        new Vector3(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0.01),
        new Vector3(x + Math.cos(b) * radius, y + Math.sin(b) * radius, 0.01), part);
    }
  }
  function bar(x1: number, y1: number, x2: number, y2: number, width: number, part: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const ox = (-dy / length) * width / 2;
    const oy = (dx / length) * width / 2;
    const a = new Vector3(x1 + ox, y1 + oy, 0.009);
    const b = new Vector3(x1 - ox, y1 - oy, 0.009);
    const c = new Vector3(x2 - ox, y2 - oy, 0.009);
    const d = new Vector3(x2 + ox, y2 + oy, 0.009);
    triangle(a, b, c, part);
    triangle(a, c, d, part);
    roundCap(x1, y1, width / 2, part);
    roundCap(x2, y2, width / 2, part);
  }
  disc(1, 0, 2); // ink outline
  disc(0.89, 0.003, 1); // species fruit face
  ring(0.81, 0.72, 0.006, 0); // inset paper-white inner ring
  bar(-0.36, -0.02, -0.14, -0.39, 0.15, 0); // short tick stroke
  bar(-0.14, -0.39, 0.24, 0.36, 0.15, 0); // long tick stroke
  const leaf = [
    new Vector3(0.015, 0.08, 0.01),
    new Vector3(0.12, -0.05, 0.01),
    new Vector3(0.36, 0.02, 0.01),
    new Vector3(0.46, 0.38, 0.01),
    new Vector3(0.26, 0.31, 0.01),
    new Vector3(0.1, 0.2, 0.01),
  ];
  const leafCenter = new Vector3(0.22, 0.15, 0.01);
  for (let edge = 0; edge < leaf.length; edge += 1) {
    triangle(leafCenter, leaf[edge]!, leaf[(edge + 1) % leaf.length]!, 0);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('statusStampPart', new Float32BufferAttribute(parts, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function createStampMaterial(): MeshBasicMaterial {
  const value = material(palette.ink['paper-white']);
  const paper = new Color(palette.ink['paper-white']);
  const ink = new Color(palette.ink['press-ink']);
  value.onBeforeCompile = (shader) => {
    shader.uniforms.statusPaper = { value: paper };
    shader.uniforms.statusInk = { value: ink };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float statusStampPart;\nvarying float vStatusStampPart;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvStatusStampPart = statusStampPart;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec3 statusPaper;\nuniform vec3 statusInk;\nvarying float vStatusStampPart;',
    ).replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nif (vStatusStampPart < 0.5) diffuseColor.rgb = statusPaper; else if (vStatusStampPart > 1.5) diffuseColor.rgb = statusInk;',
    );
  };
  value.customProgramCacheKey = () => 'plot-status-stamp-v1';
  return value;
}

function createTickGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const ticks: number[] = [];
  const indices: number[] = [];
  for (let tick = 0; tick < 3; tick += 1) {
    const base = positions.length / 3;
    positions.push(-0.055, -0.09, 0, 0.055, -0.09, 0, 0.055, 0.09, 0, -0.055, 0.09, 0);
    ticks.push(tick, tick, tick, tick);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('statusTickIndex', new Float32BufferAttribute(ticks, 1));
  geometry.setIndex(indices);
  geometry.setAttribute('instanceStages', new InstancedBufferAttribute(new Float32Array(MAX_STATUS_PLOTS * 3), 3));
  // The shader moves each marker outward by 0.75 local units before rotation.
  geometry.boundingSphere = new Sphere(new Vector3(), 1);
  return geometry;
}

function createTickMaterial(): MeshBasicMaterial {
  const value = material(palette.ink['press-ink']);
  value.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float statusTickIndex;\nattribute vec3 instanceStages;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nfloat tickStage = statusTickIndex < 0.5 ? instanceStages.x : (statusTickIndex < 1.5 ? instanceStages.y : instanceStages.z);\nfloat tickAngle = 6.2831853 * tickStage;\ntransformed.y += 0.75;\ntransformed.xy = mat2(cos(tickAngle), -sin(tickAngle), sin(tickAngle), cos(tickAngle)) * transformed.xy;',
    );
  };
  value.customProgramCacheKey = () => 'plot-status-ticks-v1';
  return value;
}

function setDiscTransform(mesh: InstancedMesh, slot: number, center: Vector3, radius: number, facing?: Quaternion): void {
  mesh.setMatrixAt(slot, new Matrix4().compose(center, facing ?? new Quaternion(), new Vector3(radius, radius, radius)));
}

export function createPlotStatusResources(): PlotStatusResources {
  const group = new Group();
  group.name = 'plot-status';

  const dialGeometry = createDialFaceGeometry();
  const pieGeometry = createPieGeometry();
  const tickGeometry = createTickGeometry();
  const stampGeometry = createStampFaceGeometry();
  const shadowGeometry = new CircleGeometry(1, 32);
  const faceMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const pieMaterial = createPieMaterial();
  const tickMaterial = createTickMaterial();
  const stampMaterial = createStampMaterial();
  const shadowMaterial = material(palette.ink['misprint-tomato']);
  stampMaterial.depthTest = false;
  stampMaterial.depthWrite = false;
  shadowMaterial.depthTest = false;
  shadowMaterial.depthWrite = false;
  const dial = new InstancedMesh(dialGeometry, faceMaterial, MAX_STATUS_PLOTS);
  const pie = new InstancedMesh(pieGeometry, pieMaterial, MAX_STATUS_PLOTS);
  const ticks = new InstancedMesh(tickGeometry, tickMaterial, MAX_STATUS_PLOTS);
  const stampShadow = new InstancedMesh(shadowGeometry, shadowMaterial, MAX_STATUS_PLOTS);
  const stampFace = new InstancedMesh(stampGeometry, stampMaterial, MAX_STATUS_PLOTS);
  dial.count = pie.count = ticks.count = stampShadow.count = stampFace.count = 0;
  dial.name = 'plot-status-dial-face';
  pie.name = 'plot-status-dial-fill';
  ticks.name = 'plot-status-dial-ticks';
  stampShadow.name = 'plot-status-stamp-shadow';
  stampFace.name = 'plot-status-stamp-face';
  stampFace.renderOrder = 100;
  stampShadow.renderOrder = 99;
  group.add(dial, pie, ticks, stampShadow, stampFace);

  let disposed = false;
  return {
    group,
    update(descriptors) {
      if (disposed) return;
      if (descriptors.length > MAX_STATUS_PLOTS) throw new RangeError(`At most ${MAX_STATUS_PLOTS} plots may have status resources`);
      let dialCount = 0;
      let stampCount = 0;
      const progress = pieGeometry.getAttribute('instanceProgress') as InstancedBufferAttribute;
      const stages = tickGeometry.getAttribute('instanceStages') as InstancedBufferAttribute;
      for (const descriptor of descriptors) {
        if (descriptor.dial) {
          const slot = dialCount++;
          const center = descriptor.dial.center;
          const fill = Math.max(0, Math.min(1, descriptor.dial.progress));
          const facing = descriptor.dial.facing;
          const normal = new Vector3(0, 0, 1).applyQuaternion(facing ?? new Quaternion());
          setDiscTransform(dial, slot, center, DIAL_RADIUS, facing);
          setDiscTransform(pie, slot, center.clone().addScaledVector(normal, 0.01), DIAL_RADIUS * 0.82, facing);
          setDiscTransform(ticks, slot, center.clone().addScaledVector(normal, 0.012), DIAL_RADIUS, facing);
          progress.setX(slot, fill);
          stages.setXYZ(slot, ...descriptor.dial.stageFractions.map((fraction) => Math.max(0, Math.min(1, fraction))) as [number, number, number]);
          pie.setColorAt(slot, new Color(descriptor.dial.color));
        }
        if (descriptor.stamp) {
          const slot = stampCount++;
          const center = descriptor.stamp.center;
          const facing = descriptor.stamp.facing;
          const right = new Vector3(1, 0, 0).applyQuaternion(facing ?? new Quaternion());
          const down = new Vector3(0, -1, 0).applyQuaternion(facing ?? new Quaternion());
          const normal = new Vector3(0, 0, 1).applyQuaternion(facing ?? new Quaternion());
          const shadowCenter = center.clone().addScaledVector(right, 0.04).addScaledVector(down, 0.04);
          setDiscTransform(stampShadow, slot, shadowCenter, STAMP_RADIUS, facing);
          setDiscTransform(stampFace, slot, center.clone().addScaledVector(normal, 0.003), STAMP_RADIUS, facing);
          stampFace.setColorAt(slot, new Color(descriptor.stamp.color));
        }
      }
      dial.count = pie.count = ticks.count = dialCount;
      stampShadow.count = stampFace.count = stampCount;
      for (const mesh of [dial, pie, ticks, stampShadow, stampFace]) mesh.computeBoundingSphere();
      dial.instanceMatrix.needsUpdate = true;
      pie.instanceMatrix.needsUpdate = true;
      ticks.instanceMatrix.needsUpdate = true;
      stampShadow.instanceMatrix.needsUpdate = true;
      stampFace.instanceMatrix.needsUpdate = true;
      progress.needsUpdate = true;
      stages.needsUpdate = true;
      if (stampFace.instanceColor) stampFace.instanceColor.needsUpdate = true;
      if (pie.instanceColor) pie.instanceColor.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of [dial, pie, ticks, stampShadow, stampFace]) mesh.dispose();
      for (const geometry of [dialGeometry, pieGeometry, tickGeometry, stampGeometry, shadowGeometry]) geometry.dispose();
      for (const item of [faceMaterial, pieMaterial, tickMaterial, stampMaterial, shadowMaterial]) item.dispose();
      group.clear();
    },
  };
}
