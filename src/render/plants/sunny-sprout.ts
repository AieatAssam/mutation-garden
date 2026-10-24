import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  CylinderGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { PlantSnapshot } from '../../sim/state/types';
import { palette } from '../palette';
import type { MaterialLibrary } from '../materials';

export interface PlantRig {
  readonly root: Group;
  update(plant: PlantSnapshot, presentationNowMs: number, reducedMotion: boolean, crystalTransmissionSlots?: number): number | void;
  shiver?(presentationNowMs: number, durationMs: number): void;
  /** Optional exact top of the visible plant in world space; the reconciler measures bounds otherwise. */
  getTop?(target: Vector3): boolean;
  dispose(): void;
}

export interface HopPose {
  readonly y: number;
  readonly scaleY: number;
}

export function springProgress(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  const response = (time: number) => 1 - Math.exp(-7 * time) * (Math.cos(10 * time) + (7 / 10) * Math.sin(10 * time));
  const endValue = response(1);
  const endSlope = Math.exp(-7) * (49 / 10 + 10) * Math.sin(10) / endValue;
  const progress = response(t) / endValue + endSlope * t * t * (1 - t);
  return Math.min(1, Math.max(0, progress));
}

export function ripeHopPose(presentationNowMs: number, phaseOffsetMs: number, active: boolean): HopPose {
  if (!active || !Number.isFinite(presentationNowMs)) return { y: 0, scaleY: 1 };
  const elapsed = ((presentationNowMs + phaseOffsetMs) % 3000 + 3000) % 3000;
  if (elapsed < 120) return { y: 0, scaleY: 1 - 0.06 * springProgress(elapsed / 120) };
  if (elapsed < 360) {
    const progress = springProgress((elapsed - 120) / 240);
    return { y: 0.05 * progress, scaleY: 0.94 + 0.10 * progress };
  }
  if (elapsed < 520) {
    const progress = springProgress((elapsed - 360) / 160);
    return { y: 0.05 * (1 - progress), scaleY: 1.04 - 0.09 * progress };
  }
  if (elapsed < 700) return { y: 0, scaleY: 0.95 + 0.05 * springProgress((elapsed - 520) / 180) };
  return { y: 0, scaleY: 1 };
}

const FRUIT_RADIUS = 0.31;
const STEM_LENGTH = 0.78;
const LEAF_RADIUS = 0.19;
const HALO_NORMAL = new Vector3(0.55, 0.45, 0.71).normalize();

function ribbedFruit(): SphereGeometry {
  const geometry = new SphereGeometry(1, 32, 24);
  geometry.scale(FRUIT_RADIUS, FRUIT_RADIUS, FRUIT_RADIUS);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const rib = 1 + 0.06 * Math.cos(angle * 8);
    positions.setX(index, x * rib);
    positions.setZ(index, z * rib);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function createSunnySprout(materials: MaterialLibrary, phaseOffsetMs = 0, hopPhaseOffsetMs = 0): PlantRig {
  const root = new Group();
  root.name = 'sunny-sprout';
  const plantBody = new Group();
  plantBody.name = 'plant-body';
  root.add(plantBody);
  const stemGeometry = new CylinderGeometry(0.10, 0.11, 1, 10, 1);
  const leafGeometry = new SphereGeometry(LEAF_RADIUS, 16, 12);
  const fruitGeometry = ribbedFruit();
  const haloGeometry = new PlaneGeometry(FRUIT_RADIUS * 4.8, FRUIT_RADIUS * 4.8);
  const haloMaterial = new ShaderMaterial({ uniforms: {
    tint: { value: new Color(palette.plants['sunny-sprout'].fruit[0]) },
    strength: { value: 0.5 },
  },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint; uniform float strength; varying vec2 vUv; void main(){float d=length(vUv-0.5)*2.0;float a=smoothstep(0.32,0.48,d)*(1.0-smoothstep(0.85,1.0,d))*strength;gl_FragColor=vec4(tint,a);\n#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false, side: DoubleSide });
  const ownedGeometries: BufferGeometry[] = [stemGeometry, leafGeometry, fruitGeometry, haloGeometry];
  const fruitRamp = palette.plants['sunny-sprout'].fruit;
  const toonFruitMaterial = materials.toon(fruitRamp[1]);
  const baseCompile = toonFruitMaterial.onBeforeCompile;
  const baseProgramKey = toonFruitMaterial.customProgramCacheKey();
  const fruitMaterial = toonFruitMaterial.clone();
  fruitMaterial.customProgramCacheKey = () => `${baseProgramKey}-sunny-ripe-ramp-v1`;
  let isRipe = false;
  let ripeUniform: { value: number } | undefined;
  fruitMaterial.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(fruitMaterial, shader, renderer);
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

  function part(geometry: BufferGeometry, color: string, name: string, parent = plantBody, material = materials.toon(color)): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.userData.part = name;
    mesh.renderOrder = 3;
    const outline = materials.outline(geometry);
    outline.renderOrder = 2;
    mesh.add(outline);
    parent.add(mesh);
    return mesh;
  }

  const stem = part(stemGeometry, palette.plants['sunny-sprout'].stem[1], 'stem');
  const leftLeaf = part(leafGeometry, palette.plants['sunny-sprout'].leaf[1], 'left-leaf');
  const rightLeaf = part(leafGeometry, palette.plants['sunny-sprout'].leaf[1], 'right-leaf');
  const fruitRig = new Group();
  fruitRig.userData.part = 'fruit';
  plantBody.add(fruitRig);
  part(fruitGeometry, fruitRamp[1], 'fruit', fruitRig, fruitMaterial);
  const halo = new Mesh(haloGeometry, haloMaterial);
  halo.name = 'halo';
  halo.userData.part = 'halo';
  halo.renderOrder = 1;
  halo.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), HALO_NORMAL);
  halo.position.copy(HALO_NORMAL).multiplyScalar(-0.05);
  fruitRig.add(halo);
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
    update(plant, presentationNowMs, reducedMotion) {
      const progress = Math.min(1, Math.max(0, plant.progress));
      const eased = progress * progress * (3 - 2 * progress);
      const length = 0.07 + STEM_LENGTH * eased;
      stem.scale.y = length;
      stem.position.y = length / 2;

      const unfurl = 0.18 + eased * 0.82;
      leftLeaf.position.set(-0.21 * unfurl, Math.min(length * 0.38, 0.28), 0);
      rightLeaf.position.set(0.21 * unfurl, Math.min(length * 0.38, 0.28), 0);
      leftLeaf.scale.set(0.78 * unfurl, 0.62 * unfurl, 0.86 * unfurl);
      rightLeaf.scale.copy(leftLeaf.scale);
      const ripe = plant.stage === 'Harvestable';
      isRipe = ripe;
      const leafLift = ripe ? Math.PI / 15 : 0;
      leftLeaf.rotation.z = 0.42 + leafLift;
      rightLeaf.rotation.z = -0.42 - leafLift;

      const fruitScale = 0.08 + 0.92 * eased;
      fruitRig.position.set(0, length + FRUIT_RADIUS * fruitScale, 0);
      fruitRig.scale.setScalar(fruitScale * (ripe ? 1.12 : 1));
      const warm = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
      const easedWarm = warm * warm * (3 - 2 * warm);
      if (progress <= 0.5) fruitMaterial.color.set(fruitRamp[3]);
      else if (progress >= 1) fruitMaterial.color.set(fruitRamp[1]);
      else fruitMaterial.color.copy(new Color(fruitRamp[3]).lerp(new Color(fruitRamp[1]), easedWarm));
      if (ripeUniform) ripeUniform.value = ripe ? 1 : 0;
      halo.visible = ripe;
      const hop = ripeHopPose(presentationNowMs, hopPhaseOffsetMs, ripe && !reducedMotion);
      plantBody.position.y = hop.y;
      plantBody.scale.y = hop.scaleY;
      const breathing = reducedMotion
        ? 1
        : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02;
      root.scale.y = breathing * (ripe ? 1.08 : 1);
      blob.position.y = 0.008 / root.scale.y;
      const shadowScale = 1 - 0.25 * Math.min(1, hop.y / 0.05);
      blob.scale.set(0.92 * shadowScale, 0.6 * shadowScale, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of ownedGeometries) geometry.dispose();
      haloMaterial.dispose();
      fruitMaterial.dispose();
      root.clear();
    },
  };
}
