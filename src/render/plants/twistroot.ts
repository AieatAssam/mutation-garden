import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlantSnapshot } from '../../sim/state/types';
import { palette } from '../palette';
import type { MaterialLibrary } from '../materials';
import { ripeHopPose, type PlantRig } from './sunny-sprout';

const ROOT_HEIGHT = 0.78;
const ROOT_CENTER_RADIUS = 0.2;
const ROOT_BASE_RADIUS = 0.18;
const ROOT_TURNS = 2.5;
const ROOT_RINGS = 40;
const ROOT_SIDES = 10;
const TUFT_LEAVES = 7;
const SEED_ROOT_GROWTH = 0.05;

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function makeRootGeometry(): BufferGeometry {
  const positions = new Float32Array((ROOT_RINGS + 1) * ROOT_SIDES * 3);
  const indices: number[] = [];
  for (let ring = 0; ring <= ROOT_RINGS; ring += 1) {
    for (let side = 0; side < ROOT_SIDES; side += 1) {
      const current = ring * ROOT_SIDES + side;
      const next = ring * ROOT_SIDES + (side + 1) % ROOT_SIDES;
      const nextRing = (ring + 1) * ROOT_SIDES + side;
      const nextRingNext = (ring + 1) * ROOT_SIDES + (side + 1) % ROOT_SIDES;
      if (ring < ROOT_RINGS) indices.push(current, nextRing, next, next, nextRing, nextRingNext);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function updateRootGeometry(geometry: BufferGeometry, growth: number): void {
  const positions = geometry.getAttribute('position') as BufferAttribute;
  const turns = ROOT_TURNS * growth;
  const height = ROOT_HEIGHT * growth;
  const angularRate = turns * Math.PI * 2;

  for (let ring = 0; ring <= ROOT_RINGS; ring += 1) {
    const t = ring / ROOT_RINGS;
    const centerAngle = turns * Math.PI * 2 * t;
    const radialX = Math.cos(centerAngle);
    const radialZ = Math.sin(centerAngle);
    const centerX = ROOT_CENTER_RADIUS * radialX;
    const centerZ = ROOT_CENTER_RADIUS * radialZ;
    const tangentX = -ROOT_CENTER_RADIUS * angularRate * radialZ;
    const tangentY = height;
    const tangentZ = ROOT_CENTER_RADIUS * angularRate * radialX;
    const tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
    const normalX = -tangentY * radialZ / tangentLength;
    const normalY = -ROOT_CENTER_RADIUS * angularRate / tangentLength;
    const normalZ = tangentY * radialX / tangentLength;
    const radius = ROOT_BASE_RADIUS * Math.pow(1 - t, 0.4) + 0.002;
    for (let side = 0; side < ROOT_SIDES; side += 1) {
      const around = (side / ROOT_SIDES) * Math.PI * 2;
      const ringX = radialX * Math.cos(around) + normalX * Math.sin(around);
      const ringY = normalY * Math.sin(around);
      const ringZ = radialZ * Math.cos(around) + normalZ * Math.sin(around);
      const index = ring * ROOT_SIDES + side;
      positions.setXYZ(
        index,
        centerX + ringX * radius,
        0.085 + height * t + ringY * radius,
        centerZ + ringZ * radius,
      );
    }
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function makeTuftGeometry(): BufferGeometry {
  const leaves: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  for (let index = 0; index < TUFT_LEAVES; index += 1) {
    const angle = (index / TUFT_LEAVES) * Math.PI * 2;
    const direction = new Vector3(Math.cos(angle) * 0.64, 0.78, Math.sin(angle) * 0.64).normalize();
    const geometry = new ConeGeometry(0.055, 0.34, 6, 1);
    const rotation = new Quaternion().setFromUnitVectors(up, direction);
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(0, 0.12, 0), rotation, new Vector3(1, 1, 1)));
    leaves.push(geometry);
  }
  const merged = mergeGeometries(leaves, false);
  leaves.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Unable to merge Twistroot tuft geometry');
  merged.computeVertexNormals();
  return merged;
}

function updateTuftSplay(geometry: BufferGeometry, original: Float32Array, splayed: boolean): void {
  const positions = geometry.getAttribute('position');
  const verticesPerLeaf = positions.count / TUFT_LEAVES;
  const angle = splayed ? Math.PI / 9 : 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let leaf = 0; leaf < TUFT_LEAVES; leaf += 1) {
    const azimuth = (leaf / TUFT_LEAVES) * Math.PI * 2;
    const radialX = Math.cos(azimuth);
    const radialZ = Math.sin(azimuth);
    for (let vertex = leaf * verticesPerLeaf; vertex < (leaf + 1) * verticesPerLeaf; vertex += 1) {
      const offset = vertex * 3;
      const x = original[offset]!;
      const y = original[offset + 1]! - 0.12;
      const z = original[offset + 2]!;
      const radial = x * radialX + z * radialZ;
      const tangentX = x - radial * radialX;
      const tangentZ = z - radial * radialZ;
      const openedRadial = radial * cosine + y * sine;
      const openedY = -radial * sine + y * cosine;
      positions.setXYZ(vertex, tangentX + openedRadial * radialX, 0.12 + openedY,
        tangentZ + openedRadial * radialZ);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

export function createTwistroot(materials: MaterialLibrary, phaseOffsetMs = 0, hopPhaseOffsetMs = 0): PlantRig {
  const root = new Group();
  root.name = 'twistroot';
  const plantBody = new Group();
  plantBody.name = 'plant-body';
  root.add(plantBody);

  const rootGeometry = makeRootGeometry();
  const soilGeometry = new SphereGeometry(1, 18, 12);
  const tuftGeometry = makeTuftGeometry();
  const originalTuftPositions = Float32Array.from(tuftGeometry.getAttribute('position').array);
  const growthRingGeometry = new TorusGeometry(0.3, 0.025, 6, 32);
  growthRingGeometry.rotateX(Math.PI / 2);
  const ownedGeometries = [rootGeometry, soilGeometry, tuftGeometry, growthRingGeometry];

  const soilBulge = new Mesh(soilGeometry, materials.toon(palette.environment.soil[1]));
  soilBulge.name = 'soil-bulge';
  soilBulge.userData.part = 'soil-bulge';
  soilBulge.position.y = 0.045;
  soilBulge.scale.set(0.34, 0.055, 0.34);
  soilBulge.renderOrder = 3;
  root.add(soilBulge);
  const soilOutline = materials.outline(soilGeometry);
  soilOutline.name = 'soil-bulge-outline';
  soilOutline.userData.part = 'soil-bulge-outline';
  soilOutline.position.copy(soilBulge.position);
  soilOutline.scale.copy(soilBulge.scale);
  soilOutline.renderOrder = 2;
  root.add(soilOutline);

  const fruitRamp = palette.plants.twistroot.fruit;
  const toonRootMaterial = materials.toon(fruitRamp[1]);
  const baseCompile = toonRootMaterial.onBeforeCompile;
  const baseProgramKey = toonRootMaterial.customProgramCacheKey();
  const rootMaterial = toonRootMaterial.clone();
  rootMaterial.customProgramCacheKey = () => `${baseProgramKey}-twistroot-ripe-ramp-v1`;
  let isRipe = false;
  let tuftIsSplayed = false;
  let ripeUniform: { value: number } | undefined;
  rootMaterial.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(rootMaterial, shader, renderer);
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
  const rootBody = new Mesh(rootGeometry, rootMaterial);
  rootBody.name = 'root-body';
  rootBody.userData.part = 'root-body';
  rootBody.renderOrder = 3;
  plantBody.add(rootBody);
  const rootOutline = materials.outline(rootGeometry);
  rootOutline.name = 'root-outline';
  rootOutline.userData.part = 'root-outline';
  rootOutline.renderOrder = 2;
  rootBody.add(rootOutline);

  const tuft = new Group();
  tuft.name = 'tuft';
  tuft.userData.part = 'tuft';
  plantBody.add(tuft);
  const leaves = new Mesh(tuftGeometry, materials.toon(palette.plants.twistroot.leaf[1]));
  leaves.name = 'tuft-leaves';
  leaves.userData.part = 'tuft-leaf';
  leaves.renderOrder = 3;
  tuft.add(leaves);
  const leavesOutline = materials.outline(tuftGeometry);
  leavesOutline.name = 'tuft-leaves-outline';
  leavesOutline.userData.part = 'tuft-leaf-outline';
  leavesOutline.renderOrder = 2;
  leaves.add(leavesOutline);

  const growthRing = new Mesh(growthRingGeometry, materials.toon(palette.plants.twistroot.accent['growth-ring']));
  growthRing.name = 'growth-ring';
  growthRing.userData.part = 'growth-ring';
  growthRing.position.set(0, 0.13, 0);
  growthRing.renderOrder = 4;
  growthRing.visible = false;
  root.add(growthRing);
  const growthRingOutline = materials.outline(growthRingGeometry, 0.01);
  growthRingOutline.name = 'growth-ring-outline';
  growthRingOutline.userData.part = 'growth-ring-outline';
  growthRingOutline.renderOrder = 3;
  growthRing.add(growthRingOutline);

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
      const rawProgress = Math.min(1, Math.max(0, plant.progress));
      const progress = smoothstep(rawProgress);
      const rootGrowth = SEED_ROOT_GROWTH + (1 - SEED_ROOT_GROWTH) * progress;
      updateRootGeometry(rootGeometry, rootGrowth);
      const ripe = plant.stage === 'Harvestable';
      isRipe = ripe;
      if (progress <= 0.5) rootMaterial.color.set(fruitRamp[3]);
      else if (progress >= 1) rootMaterial.color.set(fruitRamp[1]);
      else {
        const warm = smoothstep((rawProgress - 0.5) / 0.5);
        rootMaterial.color.copy(new Color(fruitRamp[3]).lerp(new Color(fruitRamp[1]), warm));
      }
      if (ripeUniform) ripeUniform.value = ripe ? 1 : 0;

      const tipY = 0.085 + ROOT_HEIGHT * rootGrowth + (ripe ? 0.08 : 0);
      rootBody.position.y = ripe ? 0.08 : 0;
      const tipAngle = ROOT_TURNS * rootGrowth * Math.PI * 2;
      tuft.position.set(ROOT_CENTER_RADIUS * Math.cos(tipAngle), tipY - 0.015, ROOT_CENTER_RADIUS * Math.sin(tipAngle));
      tuft.rotation.y = tipAngle;
      const tuftGrowth = 0.08 + 0.92 * smoothstep((plant.progress - 0.2) / 0.64);
      tuft.scale.setScalar(tuftGrowth);
      if (ripe !== tuftIsSplayed) {
        updateTuftSplay(tuftGeometry, originalTuftPositions, ripe);
        tuftIsSplayed = ripe;
      }
      soilBulge.scale.set(0.29 + progress * 0.05, 0.055, 0.29 + progress * 0.05);
      soilOutline.scale.copy(soilBulge.scale);

      growthRing.visible = ripe;
      const hop = ripeHopPose(presentationNowMs, hopPhaseOffsetMs, ripe && !reducedMotion);
      plantBody.position.y = hop.y;
      plantBody.scale.y = hop.scaleY;
      root.scale.y = reducedMotion
        ? 1
        : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02;
      blob.position.y = 0.008 / root.scale.y;
      soilBulge.position.y = 0.045 / root.scale.y;
      soilOutline.position.copy(soilBulge.position);
      growthRing.position.set(0, 0.13 / root.scale.y, 0);
      const shadowScale = 1 - 0.25 * Math.min(1, hop.y / 0.05);
      blob.scale.set(0.92 * shadowScale, 0.6 * shadowScale, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of ownedGeometries) geometry.dispose();
      rootMaterial.dispose();
      root.clear();
    },
  };
}
