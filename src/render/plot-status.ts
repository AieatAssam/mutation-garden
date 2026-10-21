import {
  CircleGeometry,
  Color,
  BufferGeometry,
  CylinderGeometry,
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
const DIAL_PEG_HEIGHT = 0.12;
const DIAL_TILT_RADIANS = -35 * Math.PI / 180;
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
  readonly dialScale?: number;
  readonly stamp?: {
    readonly center: Vector3;
    readonly color: ColorRepresentation;
    readonly scale?: number;
    readonly opacity?: number;
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

interface DialFaceGeometry {
  readonly geometry: BufferGeometry;
  readonly pegVertexStart: number;
  readonly pegPositions: Float32Array;
}

function createDialFaceGeometry(): DialFaceGeometry {
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

  const pegSource = new CylinderGeometry(0.035, 0.035, DIAL_PEG_HEIGHT, 8);
  const pegGeometry = pegSource.toNonIndexed();
  pegSource.dispose();
  const pegAttribute = pegGeometry.getAttribute('position');
  const pegNormals = pegGeometry.getAttribute('normal');
  const pegStart = positions.length / 3;
  const pegBasePositions = new Float32Array(pegAttribute.count * 3);
  const pegLight = new Vector3(0.4, 0.8, 0.4).normalize();
  const woodRamp = palette.environment['wood-crate'].map((color) => new Color(color));
  for (let index = 0; index < pegAttribute.count; index += 1) {
    const x = pegAttribute.getX(index);
    const y = pegAttribute.getY(index);
    const z = pegAttribute.getZ(index);
    pegBasePositions.set([x, y, z], index * 3);
    positions.push(x / DIAL_RADIUS, y / DIAL_RADIUS, z / DIAL_RADIUS);
    const light = new Vector3(pegNormals.getX(index), pegNormals.getY(index), pegNormals.getZ(index)).dot(pegLight);
    const shade = light > 0.35 ? 0 : light > -0.3 ? 1 : 2;
    const wood = woodRamp[shade]!;
    colors.push(wood.r, wood.g, wood.b);
  }
  pegGeometry.dispose();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return { geometry, pegVertexStart: pegStart, pegPositions: pegBasePositions };
}

function createStampFaceGeometry(): BufferGeometry {
  const geometry = new CircleGeometry(1, 64);
  geometry.setAttribute('instanceStatusOpacity', new InstancedBufferAttribute(new Float32Array(MAX_STATUS_PLOTS), 1));
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
      '#include <common>\nattribute float instanceStatusOpacity;\nvarying vec2 vStatusStampPoint;\nvarying float vStatusStampOpacity;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvStatusStampPoint = uv * 2.0 - 1.0;\nvStatusStampOpacity = instanceStatusOpacity;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec3 statusPaper;\nuniform vec3 statusInk;\nvarying vec2 vStatusStampPoint;\nvarying float vStatusStampOpacity;\nfloat stampSegmentDistance(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - (a + t * ab)); }\nbool stampLeafContains(vec2 p) { bool inside = false; vec2 a = vec2(0.015, 0.08); vec2 b = vec2(0.12, -0.05); vec2 c = vec2(0.36, 0.02); vec2 d = vec2(0.46, 0.38); vec2 e = vec2(0.26, 0.31); vec2 f = vec2(0.1, 0.2); if (((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside; if (((b.y > p.y) != (c.y > p.y)) && (p.x < (c.x - b.x) * (p.y - b.y) / (c.y - b.y) + b.x)) inside = !inside; if (((c.y > p.y) != (d.y > p.y)) && (p.x < (d.x - c.x) * (p.y - c.y) / (d.y - c.y) + c.x)) inside = !inside; if (((d.y > p.y) != (e.y > p.y)) && (p.x < (e.x - d.x) * (p.y - d.y) / (e.y - d.y) + d.x)) inside = !inside; if (((e.y > p.y) != (f.y > p.y)) && (p.x < (f.x - e.x) * (p.y - e.y) / (f.y - e.y) + e.x)) inside = !inside; if (((f.y > p.y) != (a.y > p.y)) && (p.x < (a.x - f.x) * (p.y - f.y) / (a.y - f.y) + f.x)) inside = !inside; return inside; }',
    ).replace(
      '#include <color_fragment>',
      '#include <color_fragment>\nfloat stampRadius = length(vStatusStampPoint);\nfloat stampAa = max(fwidth(stampRadius), 0.003);\nif (stampRadius > 1.0) discard;\nfloat outlineMask = smoothstep(0.89 - stampAa, 0.89 + stampAa, stampRadius);\nfloat ringMask = smoothstep(0.72 - stampAa, 0.72 + stampAa, stampRadius) * (1.0 - smoothstep(0.81 - stampAa, 0.81 + stampAa, stampRadius));\nfloat tickDistance = min(stampSegmentDistance(vStatusStampPoint, vec2(-0.36, -0.02), vec2(-0.14, -0.39)), stampSegmentDistance(vStatusStampPoint, vec2(-0.14, -0.39), vec2(0.24, 0.36)));\nfloat tickMask = 1.0 - smoothstep(0.075 - stampAa, 0.075 + stampAa, tickDistance);\nfloat paperMask = max(ringMask, max(tickMask, stampLeafContains(vStatusStampPoint) ? 1.0 : 0.0));\ndiffuseColor.rgb = mix(diffuseColor.rgb, statusInk, outlineMask);\ndiffuseColor.rgb = mix(diffuseColor.rgb, statusPaper, paperMask);\ndiffuseColor.a *= vStatusStampOpacity;',
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

export function getPlotStatusDialFacing(facing?: Quaternion): Quaternion {
  return (facing ?? new Quaternion()).clone()
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), DIAL_TILT_RADIANS));
}

export function createPlotStatusResources(): PlotStatusResources {
  const group = new Group();
  group.name = 'plot-status';

  const dialFace = createDialFaceGeometry();
  const dialGeometry = dialFace.geometry;
  const pieGeometry = createPieGeometry();
  const tickGeometry = createTickGeometry();
  const stampGeometry = createStampFaceGeometry();
  const shadowGeometry = new CircleGeometry(1, 32);
  shadowGeometry.setAttribute('instanceStatusOpacity', new InstancedBufferAttribute(new Float32Array(MAX_STATUS_PLOTS), 1));
  const faceMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const pieMaterial = createPieMaterial();
  const tickMaterial = createTickMaterial();
  const stampMaterial = createStampMaterial();
  const shadowMaterial = material(palette.ink['misprint-tomato']);
  shadowMaterial.transparent = true;
  shadowMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float instanceStatusOpacity;\nvarying float vStatusShadowOpacity;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvStatusShadowOpacity = instanceStatusOpacity;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying float vStatusShadowOpacity;',
    ).replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= vStatusShadowOpacity;',
    );
  };
  shadowMaterial.customProgramCacheKey = () => 'plot-status-shadow-v1';
  stampMaterial.transparent = true;
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
      const stampOpacity = stampGeometry.getAttribute('instanceStatusOpacity') as InstancedBufferAttribute;
      const shadowOpacity = shadowGeometry.getAttribute('instanceStatusOpacity') as InstancedBufferAttribute;
      for (const descriptor of descriptors) {
        if (descriptor.dial) {
          const slot = dialCount++;
          const center = descriptor.dial.center;
          const fill = Math.max(0, Math.min(1, descriptor.dial.progress));
          const dialScale = Math.max(0, descriptor.dialScale ?? 1);
          const facing = getPlotStatusDialFacing(descriptor.dial.facing);
          const normal = new Vector3(0, 0, 1).applyQuaternion(facing);
          if (slot === 0) {
            const inverseFacing = facing.clone().invert();
            const positions = dialGeometry.getAttribute('position') as Float32BufferAttribute;
            const pegOffset = dialFace.pegVertexStart;
            const dialUp = new Vector3(0, 1, 0).applyQuaternion(facing);
            // The peg runs vertically from the bed rim to the dial's lower edge.
            const pegCenter = dialUp.multiplyScalar(-DIAL_RADIUS);
            pegCenter.y -= DIAL_PEG_HEIGHT / 2;
            for (let vertex = 0; vertex < dialFace.pegPositions.length / 3; vertex += 1) {
              const base = vertex * 3;
              const world = new Vector3(
                dialFace.pegPositions[base]!,
                dialFace.pegPositions[base + 1]!,
                dialFace.pegPositions[base + 2]!,
              ).add(pegCenter);
              const local = world.applyQuaternion(inverseFacing).multiplyScalar(1 / DIAL_RADIUS);
              positions.setXYZ(pegOffset + vertex, local.x, local.y, local.z);
            }
            positions.needsUpdate = true;
          }
          setDiscTransform(dial, slot, center, DIAL_RADIUS * dialScale, facing);
          setDiscTransform(pie, slot, center.clone().addScaledVector(normal, 0.01), DIAL_RADIUS * 0.82 * dialScale, facing);
          setDiscTransform(ticks, slot, center.clone().addScaledVector(normal, 0.012), DIAL_RADIUS * dialScale, facing);
          progress.setX(slot, fill);
          stages.setXYZ(slot, ...descriptor.dial.stageFractions.map((fraction) => Math.max(0, Math.min(1, fraction))) as [number, number, number]);
          pie.setColorAt(slot, new Color(descriptor.dial.color));
        }
        if (descriptor.stamp) {
          const slot = stampCount++;
          const center = descriptor.stamp.center;
          const stampScale = Math.max(0, descriptor.stamp.scale ?? 1);
          const opacity = Math.max(0, Math.min(1, descriptor.stamp.opacity ?? 1));
          const facing = descriptor.stamp.facing;
          const right = new Vector3(1, 0, 0).applyQuaternion(facing ?? new Quaternion());
          const down = new Vector3(0, -1, 0).applyQuaternion(facing ?? new Quaternion());
          const normal = new Vector3(0, 0, 1).applyQuaternion(facing ?? new Quaternion());
          const shadowCenter = center.clone().addScaledVector(right, 0.04).addScaledVector(down, 0.04);
          setDiscTransform(stampShadow, slot, shadowCenter, STAMP_RADIUS * stampScale, facing);
          setDiscTransform(stampFace, slot, center.clone().addScaledVector(normal, 0.003), STAMP_RADIUS * stampScale, facing);
          stampOpacity.setX(slot, opacity);
          shadowOpacity.setX(slot, opacity);
          stampFace.setColorAt(slot, new Color(descriptor.stamp.color));
        }
      }
      dial.count = pie.count = ticks.count = dialCount;
      stampShadow.count = stampFace.count = stampCount;
      dialGeometry.computeVertexNormals();
      dialGeometry.computeBoundingSphere();
      for (const mesh of [dial, pie, ticks, stampShadow, stampFace]) mesh.computeBoundingSphere();
      dial.instanceMatrix.needsUpdate = true;
      pie.instanceMatrix.needsUpdate = true;
      ticks.instanceMatrix.needsUpdate = true;
      stampShadow.instanceMatrix.needsUpdate = true;
      stampFace.instanceMatrix.needsUpdate = true;
      progress.needsUpdate = true;
      stages.needsUpdate = true;
      stampOpacity.needsUpdate = true;
      shadowOpacity.needsUpdate = true;
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
