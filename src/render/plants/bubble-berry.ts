import {
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlantSnapshot } from '../../sim/state/types';
import { palette } from '../palette';
import type { MaterialLibrary } from '../materials';
import type { PlantRig } from './sunny-sprout';

const FRUIT_COLOR = palette.plants['bubble-berry'].fruit[1];
const LEAF_COLOR = palette.plants['bubble-berry'].leaf[1];
const DOME_COLOR = palette.plants['bubble-berry'].stem[1];
const HIGHLIGHT_COLOR = palette.plants['bubble-berry'].accent.highlight;
const DOME_GROWTH_START = 0.08;
const DOME_GROWTH_END = 0.64;
const BERRY_GROWTH_START = 0.12;
const BERRY_GROWTH_END = 0.72;
const LEAF_UNFURL_START = 0.04;
const LEAF_UNFURL_END = 0.54;
const BERRIES = [
  { x: 0, y: 0.48, z: -0.025, radius: 0.19 },
  { x: -0.16, y: 0.405, z: 0.045, radius: 0.16 },
  { x: 0.16, y: 0.42, z: 0.025, radius: 0.17 },
  { x: -0.025, y: 0.385, z: -0.18, radius: 0.15 },
  { x: 0.015, y: 0.37, z: 0.17, radius: 0.15 },
] as const;
const LEAF_COUNT = 8;

function smoothstepRange(value: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

interface SpherePart {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly rotationY?: number;
}

function mergeSpheres(parts: readonly SpherePart[], widthSegments = 16, heightSegments = 12): BufferGeometry {
  const geometries = parts.map((part) => {
    const geometry = new SphereGeometry(1, widthSegments, heightSegments);
    const transform = new Matrix4().compose(
      new Vector3(part.x, part.y, part.z),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), part.rotationY ?? 0),
      new Vector3(part.scaleX, part.scaleY, part.scaleZ),
    );
    geometry.applyMatrix4(transform);
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) throw new Error('Unable to merge Bubble Berry geometry');
  merged.computeVertexNormals();
  return merged;
}

function makeDome(): BufferGeometry {
  const geometry = new SphereGeometry(1, 24, 16);
  geometry.scale(0.4, 0.21, 0.38);
  geometry.translate(0, 0.12, 0);
  return geometry;
}

function makeLeaves(): BufferGeometry {
  const parts: SpherePart[] = [];
  for (let index = 0; index < LEAF_COUNT; index += 1) {
    const angle = (index / LEAF_COUNT) * Math.PI * 2;
    parts.push({
      x: Math.sin(angle) * 0.36,
      y: 0.065,
      z: Math.cos(angle) * 0.36,
      scaleX: 0.23,
      scaleY: 0.075,
      scaleZ: 0.13,
      rotationY: angle,
    });
  }
  return mergeSpheres(parts);
}

function makeBerries(): BufferGeometry {
  return mergeSpheres(BERRIES.map(({ x, y, z, radius }) => ({
    x, y, z,
    scaleX: radius,
    scaleY: radius,
    scaleZ: radius,
  })), 20, 16);
}

function makeHighlights(): BufferGeometry {
  return mergeSpheres(BERRIES.map(({ x, y, z, radius }) => ({
    x: x - radius * 0.28,
    y: y + radius * 0.37,
    z: z + radius * 0.78,
    scaleX: 0.026,
    scaleY: 0.026,
    scaleZ: 0.026,
  })), 8, 6);
}

function makeHaloMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      tint: { value: new Color(palette.plants['bubble-berry'].fruit[0]) },
      strength: { value: 0.3 },
    },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint; uniform float strength; varying vec2 vUv; void main(){float d=length(vUv-0.5)*2.0;float a=(1.0-smoothstep(0.05,1.0,d))*strength;gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function createBubbleBerry(materials: MaterialLibrary, phaseOffsetMs = 0): PlantRig {
  const root = new Group();
  root.name = 'bubble-berry';
  const domeGeometry = makeDome();
  const leafGeometry = makeLeaves();
  const berryGeometry = makeBerries();
  const highlightGeometry = makeHighlights();
  const haloGeometry = new PlaneGeometry(0.94, 0.94);
  const ownedGeometries = [domeGeometry, leafGeometry, berryGeometry, highlightGeometry, haloGeometry];
  const berryCluster = new Group();
  berryCluster.name = 'berry-cluster';
  const haloMaterial = makeHaloMaterial();

  function addPart(geometry: BufferGeometry, color: string, name: string, outlined: boolean): Mesh {
    const mesh = new Mesh(geometry, materials.toon(color));
    mesh.name = name;
    mesh.userData.part = name;
    mesh.renderOrder = 3;
    root.add(mesh);
    if (outlined) {
      const outline = materials.outline(geometry);
      outline.name = `${name}-outline`;
      outline.userData.part = `${name}-outline`;
      outline.renderOrder = 2;
      mesh.add(outline);
    }
    return mesh;
  }

  const dome = addPart(domeGeometry, DOME_COLOR, 'dome', true);
  const leaves = addPart(leafGeometry, LEAF_COLOR, 'leaves', true);
  leaves.userData.leafCount = LEAF_COUNT;
  root.add(berryCluster);
  const berries = new Mesh(berryGeometry, materials.toon(FRUIT_COLOR));
  berries.name = 'berries';
  berries.userData.part = 'berries';
  berries.userData.berryCount = BERRIES.length;
  berries.renderOrder = 3;
  berryCluster.add(berries);
  const berryOutline = materials.outline(berryGeometry);
  berryOutline.name = 'berries-outline';
  berryOutline.userData.part = 'berries-outline';
  berryOutline.renderOrder = 2;
  berries.add(berryOutline);

  const highlights = new Mesh(highlightGeometry, materials.toon(HIGHLIGHT_COLOR));
  highlights.name = 'highlights';
  highlights.userData.part = 'highlights';
  highlights.userData.highlightCount = BERRIES.length;
  highlights.renderOrder = 4;
  berryCluster.add(highlights);

  const halo = new Mesh(haloGeometry, haloMaterial);
  halo.name = 'halo';
  halo.userData.part = 'halo';
  halo.position.y = 0.28;
  halo.rotation.x = -Math.PI / 2;
  halo.renderOrder = 1;
  halo.visible = false;
  root.add(halo);

  const blob = materials.blob();
  blob.name = 'blob';
  blob.userData.part = 'blob';
  blob.position.y = 0.008;
  blob.scale.set(0.92, 0.6, 1);
  blob.rotation.x = -Math.PI / 2;
  root.add(blob);

  let disposed = false;
  let flickStartedAt: number | null = null;
  return {
    root,
    flickLeaves(presentationNowMs, reducedMotion) {
      if (!reducedMotion && Number.isFinite(presentationNowMs)) flickStartedAt = presentationNowMs;
    },
    update(plant: PlantSnapshot, presentationNowMs: number, reducedMotion: boolean) {
      const progress = Math.min(1, Math.max(0, plant.progress));
      const domeGrowth = smoothstepRange(progress, DOME_GROWTH_START, DOME_GROWTH_END);
      const berryGrowth = smoothstepRange(progress, BERRY_GROWTH_START, BERRY_GROWTH_END);
      const leafUnfurl = smoothstepRange(progress, LEAF_UNFURL_START, LEAF_UNFURL_END);
      const domeSize = 0.08 + domeGrowth * 0.92;
      const berrySize = 0.015 + berryGrowth * 0.985;
      const leafSpread = 0.2 + leafUnfurl * 0.8;
      dome.scale.setScalar(domeSize);
      berryCluster.scale.setScalar(berrySize);
      berryCluster.position.y = (1 - berryGrowth) * 0.16;
      leaves.scale.set(leafSpread, 0.58 + leafUnfurl * 0.42, leafSpread);
      leaves.position.y = domeSize * 0.15;
      const flickProgress = flickStartedAt === null ? 1
        : Math.max(0, Math.min(1, (presentationNowMs - flickStartedAt) / 260));
      leaves.rotation.z = reducedMotion ? 0 : Math.cos(flickProgress * Math.PI / 2) * 0.32;
      if (flickProgress >= 1) flickStartedAt = null;
      root.scale.set(1, reducedMotion
        ? 1
        : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02, 1);

      const ripe = plant.stage === 'Harvestable';
      halo.visible = ripe;
      berries.rotation.z = ripe && !reducedMotion
        ? Math.sin(((presentationNowMs + phaseOffsetMs) / 3000) * Math.PI * 2) * 0.055
        : 0;
      berries.rotation.x = ripe && !reducedMotion
        ? Math.sin(((presentationNowMs + phaseOffsetMs) / 3000) * Math.PI * 2) * 0.025
        : 0;
      highlights.rotation.copy(berries.rotation);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of ownedGeometries) geometry.dispose();
      haloMaterial.dispose();
      root.clear();
    },
  };
}
