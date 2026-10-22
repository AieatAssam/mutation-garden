import { type BufferGeometry, Color, DoubleSide, Group, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import { GROUND_SURFACE } from './garden';
import { windAt } from './motion/wind';
import { palette } from './palette';

/**
 * Ambient life (m1-liveliness.md 4.3): butterflies wander over the island and a leaf now and then
 * falls past the edge. Render-only, driven by presentation time; never pickable. Reduced motion
 * hides them. One draw call each.
 */
export interface Ambient {
  readonly group: Group;
  update(nowMs: number, reducedMotion: boolean): void;
  readonly counts: { readonly butterflies: number; readonly leaves: number };
  dispose(): void;
}

export const MAX_BUTTERFLIES = 2;
export const MAX_LEAVES = 4;
const WING_SCALE = 4.2;
const FLAP_MS = 350;
const LEAF_EVERY_MS = 8000;
const LEAF_JITTER_MS = 2000;
const LEAF_LIFE_MS = 4000;
const LEAF_SCALE = 2.1;
/** Tree crown and two rim spots (tools/blender/build_garden.py), in game coordinates. */
const LEAF_SOURCES = [[-2.7, 1.9, -2.35], [2.9, 0.7, 1.6], [-3.2, 0.7, 1.2]] as const;

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

function leafStart(k: number): number {
  return k * LEAF_EVERY_MS + (hash(k) - 0.5) * 2 * LEAF_JITTER_MS;
}

export function createAmbient(shapes: ReadonlyMap<string, BufferGeometry>): Ambient {
  const group = new Group();
  group.name = 'ambient';
  const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const leafMaterial = new MeshBasicMaterial({ side: DoubleSide });
  const wing = shapes.get('wing');
  const leaf = shapes.get('leaf');
  const wings = wing ? new InstancedMesh(wing, material, MAX_BUTTERFLIES * 2) : null;
  const leaves = leaf ? new InstancedMesh(leaf, leafMaterial, MAX_LEAVES) : null;
  const leafColors = [new Color(palette.environment.grass[1]), new Color(palette.environment['wood-crate'][0])];
  for (const mesh of [wings, leaves]) {
    if (!mesh) continue;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.count = 0;
    group.add(mesh);
  }
  if (leaves) leaves.setColorAt(0, leafColors[0]!);
  const dummy = new Object3D();
  const counts = { butterflies: 0, leaves: 0 };

  return {
    group,
    counts,
    update(nowMs, reducedMotion) {
      counts.butterflies = 0;
      counts.leaves = 0;
      if (reducedMotion) {
        if (wings) wings.count = 0;
        if (leaves) leaves.count = 0;
        return;
      }
      const t = nowMs / 1000;
      if (wings) {
        for (let index = 0; index < MAX_BUTTERFLIES; index += 1) {
          // A slow Lissajous loop over the island; heading follows the path.
          const phase = index * 2.4;
          const x = 2.3 * Math.sin(t * 0.11 + phase);
          const z = 2.1 * Math.sin(t * 0.17 + phase * 1.7);
          const dx = 2.3 * 0.11 * Math.cos(t * 0.11 + phase);
          const dz = 2.1 * 0.17 * Math.cos(t * 0.17 + phase * 1.7);
          const y = GROUND_SURFACE.y + 1.4 + 0.25 * Math.sin(t * 1.3 + phase);
          const flap = 0.45 + 0.85 * Math.abs(Math.sin((nowMs / FLAP_MS + index * 0.37) * Math.PI));
          for (let wingIndex = 0; wingIndex < 2; wingIndex += 1) {
            const side = wingIndex === 0 ? 1 : -1;
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, Math.atan2(dx, dz) + Math.PI, side * flap, 'YXZ');
            dummy.scale.set(side * WING_SCALE, WING_SCALE, WING_SCALE);
            dummy.updateMatrix();
            wings.setMatrixAt(index * 2 + wingIndex, dummy.matrix);
          }
          counts.butterflies += 1;
        }
        wings.count = counts.butterflies * 2;
        wings.instanceMatrix.needsUpdate = true;
      }
      if (leaves) {
        // One leaf per 8 s cell, ±2 s, so gaps are 6 to 10 s; only the current and previous cells can be alive.
        const cell = Math.floor(nowMs / LEAF_EVERY_MS);
        for (let k = cell - 1; k <= cell && counts.leaves < MAX_LEAVES; k += 1) {
          if (nowMs < leafStart(k) || nowMs - leafStart(k) >= LEAF_LIFE_MS) continue;
          const age = (nowMs - leafStart(k)) / 1000;
          const [sx, sy, sz] = LEAF_SOURCES[Math.floor(hash(k + 13) * LEAF_SOURCES.length)]!;
          const gust = windAt(sx, nowMs);
          dummy.position.set(sx + 0.45 * age + 0.12 * Math.sin(age * 3) + 0.05 * gust, sy - 0.6 * age,
            sz + 0.25 * Math.sin(age * 2 + k));
          dummy.rotation.set(age * 2.6 + k, age * 1.7, age * 3.1);
          // Shrink away over the last 0.6 s instead of fading, so the material stays opaque.
          dummy.scale.setScalar(LEAF_SCALE * Math.min(1, (LEAF_LIFE_MS / 1000 - age) / 0.6));
          dummy.updateMatrix();
          leaves.setMatrixAt(counts.leaves, dummy.matrix);
          leaves.setColorAt(counts.leaves, leafColors[k & 1]!);
          counts.leaves += 1;
        }
        leaves.count = counts.leaves;
        leaves.instanceMatrix.needsUpdate = true;
        if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      wings?.dispose();
      leaves?.dispose();
      material.dispose();
      leafMaterial.dispose();
    },
  };
}
