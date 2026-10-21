import {
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
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

function updateLeafOpening(geometry: BufferGeometry, original: Float32Array, open: boolean): void {
  const positions = geometry.getAttribute('position');
  const verticesPerLeaf = positions.count / LEAF_COUNT;
  const angle = open ? Math.PI / 12 : 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let leaf = 0; leaf < LEAF_COUNT; leaf += 1) {
    const azimuth = (leaf / LEAF_COUNT) * Math.PI * 2;
    const radialX = Math.sin(azimuth);
    const radialZ = Math.cos(azimuth);
    const hingeX = radialX * 0.23;
    const hingeZ = radialZ * 0.23;
    for (let vertex = leaf * verticesPerLeaf; vertex < (leaf + 1) * verticesPerLeaf; vertex += 1) {
      const offset = vertex * 3;
      const x = original[offset]! - hingeX;
      const y = original[offset + 1]! - 0.065;
      const z = original[offset + 2]! - hingeZ;
      const radial = x * radialX + z * radialZ;
      const tangentX = x - radial * radialX;
      const tangentZ = z - radial * radialZ;
      const openedRadial = radial * cosine - y * sine;
      const openedY = radial * sine + y * cosine;
      positions.setXYZ(vertex, hingeX + tangentX + openedRadial * radialX, 0.065 + openedY,
        hingeZ + tangentZ + openedRadial * radialZ);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
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

export function createBubbleBerry(materials: MaterialLibrary, phaseOffsetMs = 0): PlantRig {
  const root = new Group();
  root.name = 'bubble-berry';
  const domeGeometry = makeDome();
  const leafGeometry = makeLeaves();
  const berryGeometry = makeBerries();
  const highlightGeometry = makeHighlights();
  const ownedGeometries = [domeGeometry, leafGeometry, berryGeometry, highlightGeometry];
  const berryCluster = new Group();
  berryCluster.name = 'berry-cluster';
  const fruitRamp = palette.plants['bubble-berry'].fruit;
  const toonBerryMaterial = materials.toon(FRUIT_COLOR);
  const baseCompile = toonBerryMaterial.onBeforeCompile;
  const baseProgramKey = toonBerryMaterial.customProgramCacheKey();
  const berryMaterial = toonBerryMaterial.clone();
  berryMaterial.customProgramCacheKey = () => `${baseProgramKey}-bubble-ripe-ramp-v1`;
  let isRipe = false;
  let leavesAreOpen = false;
  let ripeUniform: { value: number } | undefined;
  berryMaterial.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(berryMaterial, shader, renderer);
    shader.uniforms.seedPacketStepOne = { value: new Color(fruitRamp[0]) };
    shader.uniforms.seedPacketRipe = { value: isRipe ? 1 : 0 };
    ripeUniform = shader.uniforms.seedPacketRipe as { value: number };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform vec3 seedPacketStepOne;\nuniform float seedPacketRipe;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'float seedPacketBaseLight = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0001);\n'
        + 'float seedPacketBand = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) / seedPacketBaseLight;\n'
        + 'outgoingLight = mix(outgoingLight, seedPacketStepOne, step(0.92, seedPacketBand) * seedPacketRipe);\n'
        + '#include <opaque_fragment>');
  };

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
  const originalLeafPositions = Float32Array.from(leafGeometry.getAttribute('position').array);
  leaves.userData.leafCount = LEAF_COUNT;
  root.add(berryCluster);
  const berries = new Mesh(berryGeometry, berryMaterial);
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

  const blob = materials.blob();
  blob.name = 'blob';
  blob.userData.part = 'blob';
  blob.position.y = 0.008;
  blob.scale.set(0.92, 0.6, 1);
  blob.rotation.x = -Math.PI / 2;
  root.add(blob);

  let disposed = false;
  return {
    root,
    update(plant: PlantSnapshot, presentationNowMs: number, reducedMotion: boolean) {
      const progress = Math.min(1, Math.max(0, plant.progress));
      const domeGrowth = smoothstepRange(progress, DOME_GROWTH_START, DOME_GROWTH_END);
      const berryGrowth = smoothstepRange(progress, BERRY_GROWTH_START, BERRY_GROWTH_END);
      const leafUnfurl = smoothstepRange(progress, LEAF_UNFURL_START, LEAF_UNFURL_END);
      const domeSize = 0.08 + domeGrowth * 0.92;
      const berrySize = 0.015 + berryGrowth * 0.985;
      const leafSpread = 0.2 + leafUnfurl * 0.8;
      const ripe = plant.stage === 'Harvestable';
      isRipe = ripe;
      const warm = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
      const easedWarm = warm * warm * (3 - 2 * warm);
      dome.scale.setScalar(domeSize);
      if (progress <= 0.5) berryMaterial.color.set(fruitRamp[3]);
      else if (progress >= 1) berryMaterial.color.set(fruitRamp[1]);
      else berryMaterial.color.copy(new Color(fruitRamp[3]).lerp(new Color(fruitRamp[1]), easedWarm));
      if (ripeUniform) ripeUniform.value = ripe ? 1 : 0;
      const ripeSpread = ripe ? 1.1 : 1;
      berryCluster.scale.set(berrySize * ripeSpread, berrySize, berrySize * ripeSpread);
      berryCluster.position.y = (1 - berryGrowth) * 0.16 + (ripe ? 0.062 : 0);
      leaves.scale.set(leafSpread, 0.58 + leafUnfurl * 0.42, leafSpread);
      if (ripe !== leavesAreOpen) {
        updateLeafOpening(leafGeometry, originalLeafPositions, ripe);
        leavesAreOpen = ripe;
      }
      leaves.position.y = domeSize * 0.15;
      root.scale.set(1, reducedMotion
        ? 1
        : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02, 1);

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
      berryMaterial.dispose();
      root.clear();
    },
  };
}
