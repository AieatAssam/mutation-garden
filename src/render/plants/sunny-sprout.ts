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
  update(plant: PlantSnapshot, presentationNowMs: number, reducedMotion: boolean): void;
  flickLeaves(presentationNowMs: number, reducedMotion: boolean): void;
  dispose(): void;
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

export function createSunnySprout(materials: MaterialLibrary, phaseOffsetMs = 0): PlantRig {
  const root = new Group();
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

  function part(geometry: BufferGeometry, color: string, name: string, parent = root): Mesh {
    const mesh = new Mesh(geometry, materials.toon(color));
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
  root.add(fruitRig);
  part(fruitGeometry, palette.plants['sunny-sprout'].fruit[1], 'fruit', fruitRig);
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
  let flickStartedAt: number | null = null;
  return {
    root,
    flickLeaves(presentationNowMs, reducedMotion) {
      if (!reducedMotion && Number.isFinite(presentationNowMs)) flickStartedAt = presentationNowMs;
    },
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
      const flickProgress = flickStartedAt === null ? 1
        : Math.max(0, Math.min(1, (presentationNowMs - flickStartedAt) / 260));
      const flick = reducedMotion ? 0 : Math.cos(flickProgress * Math.PI / 2) * 0.48;
      if (flickProgress >= 1) flickStartedAt = null;
      leftLeaf.rotation.z = 0.42 + flick;
      rightLeaf.rotation.z = -0.42 - flick;

      const fruitScale = 0.08 + 0.92 * eased;
      fruitRig.position.set(0, length + FRUIT_RADIUS * fruitScale, 0);
      fruitRig.scale.setScalar(fruitScale);
      const ripe = plant.stage === 'Harvestable';
      halo.visible = ripe;
      fruitRig.rotation.z = ripe && !reducedMotion
        ? Math.sin(((presentationNowMs + phaseOffsetMs) / 3000) * Math.PI * 2) * 0.075
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
