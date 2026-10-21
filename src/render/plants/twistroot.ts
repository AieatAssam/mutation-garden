import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
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

function makeHaloMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      tint: { value: new Color(palette.plants.twistroot.fruit[0]) },
      strength: { value: 0.38 },
    },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint; uniform float strength; varying vec2 vUv; void main(){float d=length(vUv-0.5)*2.0;float a=smoothstep(0.28,0.44,d)*(1.0-smoothstep(0.82,1.0,d))*strength;gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export function createTwistroot(materials: MaterialLibrary, phaseOffsetMs = 0): PlantRig {
  const root = new Group();
  root.name = 'twistroot';

  const rootGeometry = makeRootGeometry();
  const soilGeometry = new SphereGeometry(1, 18, 12);
  const tuftGeometry = makeTuftGeometry();
  const haloGeometry = new PlaneGeometry(0.9, 0.9);
  const ownedGeometries = [rootGeometry, soilGeometry, tuftGeometry, haloGeometry];
  const haloMaterial = makeHaloMaterial();

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

  const rootBody = new Mesh(rootGeometry, materials.toon(palette.plants.twistroot.fruit[1]));
  rootBody.name = 'root-body';
  rootBody.userData.part = 'root-body';
  rootBody.renderOrder = 3;
  root.add(rootBody);
  const rootOutline = materials.outline(rootGeometry);
  rootOutline.name = 'root-outline';
  rootOutline.userData.part = 'root-outline';
  rootOutline.renderOrder = 2;
  rootBody.add(rootOutline);

  const tuft = new Group();
  tuft.name = 'tuft';
  tuft.userData.part = 'tuft';
  root.add(tuft);
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

  const halo = new Mesh(haloGeometry, haloMaterial);
  halo.name = 'ripe-halo';
  halo.userData.part = 'ripe-halo';
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
      const progress = smoothstep(plant.progress);
      const rootGrowth = SEED_ROOT_GROWTH + (1 - SEED_ROOT_GROWTH) * progress;
      updateRootGeometry(rootGeometry, rootGrowth);

      const tipY = 0.085 + ROOT_HEIGHT * rootGrowth;
      const tipAngle = ROOT_TURNS * rootGrowth * Math.PI * 2;
      tuft.position.set(ROOT_CENTER_RADIUS * Math.cos(tipAngle), tipY - 0.015, ROOT_CENTER_RADIUS * Math.sin(tipAngle));
      tuft.rotation.y = tipAngle;
      const flickProgress = flickStartedAt === null ? 1
        : Math.max(0, Math.min(1, (presentationNowMs - flickStartedAt) / 260));
      tuft.rotation.x = reducedMotion ? 0 : Math.cos(flickProgress * Math.PI / 2) * 0.28;
      if (flickProgress >= 1) flickStartedAt = null;
      const tuftGrowth = 0.08 + 0.92 * smoothstep((plant.progress - 0.2) / 0.64);
      tuft.scale.setScalar(tuftGrowth);
      soilBulge.scale.set(0.29 + progress * 0.05, 0.055, 0.29 + progress * 0.05);
      soilOutline.scale.copy(soilBulge.scale);

      const ripe = plant.stage === 'Harvestable';
      halo.visible = ripe;
      halo.position.set(0, 0.015, 0);
      halo.scale.setScalar(0.7 + progress * 0.3);
      root.rotation.z = ripe && !reducedMotion
        ? Math.sin(((presentationNowMs + phaseOffsetMs) / 3000) * Math.PI * 2) * 0.035
        : 0;
      root.scale.set(1, reducedMotion
        ? 1
        : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02, 1);
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
