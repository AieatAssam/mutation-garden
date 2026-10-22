import { Box3, BufferAttribute, BufferGeometry, CircleGeometry, Color, Group, Matrix3, Matrix4, Mesh, MeshBasicMaterial, MeshToonMaterial, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SpeciesId } from '../../sim';
import type { MaterialLibrary } from '../materials';
import { palette } from '../palette';
import { paletteColor } from '../scenery';
import { ripeHopPose, type PlantRig } from './sunny-sprout';

/**
 * One authored plant part (tools/blender/build_plants.py). Its geometry is relative to its pivot.
 * Elongating bodies carry a "grow" morph; every other part scales up from its pivot and, when
 * attached, rides its parent's tip so it never floats away from it while both grow.
 */
export interface PartTemplate {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: string;
  /** Pivot in the species' space (plot anchor at the origin). */
  readonly origin: Vector3;
  readonly growStart: number;
  readonly growEnd: number;
  /** Name of the part whose tip this part rides, or "" for the soil. */
  readonly attach: string;
  readonly ripe: boolean;
  readonly fly: boolean;
  readonly morph: boolean;
  /** Highest vertex, local to the pivot, as a seedling (morph 0) and fully grown. */
  readonly seedTop: Vector3;
  readonly grownTop: Vector3;
  /** Centre of the fully grown shape, local to the pivot. */
  readonly grownCenter: Vector3;
}

export interface PlantModels {
  readonly parts: ReadonlyMap<SpeciesId, readonly PartTemplate[]>;
  dispose(): void;
}

const SPECIES: readonly SpeciesId[] = ['sunny-sprout', 'bubble-berry', 'twistroot'];
/** Display size per species, tuned so each plant fills its bed at phone size. */
export const SPECIES_SCALE: Readonly<Record<SpeciesId, number>> = { 'sunny-sprout': 1.15, 'bubble-berry': 1.5, twistroot: 1.4 };
const RIPE_SWELL = 1.14;
const DROP_MS = 140;

/** The seed falls into the soil, squashes to 0.7 and springs back (motion.md 4.1). */
export function seedDrop(sincePlantedMs: number): { y: number; squash: number } {
  if (!(sincePlantedMs >= 0) || sincePlantedMs > 600) return { y: 0, squash: 1 };
  if (sincePlantedMs < DROP_MS) {
    const t = sincePlantedMs / DROP_MS;
    return { y: 0.55 * (1 - t * t), squash: 1 + 0.15 * t };
  }
  const t = sincePlantedMs - DROP_MS;
  return { y: 0, squash: 1 - 0.3 * Math.exp(-t / 70) * Math.cos(t / 32) };
}

function vertexAt(geometry: BufferGeometry, index: number, influence: number, target: Vector3): Vector3 {
  target.fromBufferAttribute(geometry.getAttribute('position'), index);
  const delta = geometry.morphAttributes.position?.[0];
  if (delta) target.addScaledVector(new Vector3().fromBufferAttribute(delta, index), influence);
  return target;
}

/** Index of the highest vertex when fully grown: a parent's tip, which its attached parts ride. */
function topIndex(geometry: BufferGeometry): number {
  const point = new Vector3();
  let best = 0;
  let bestY = -Infinity;
  for (let index = 0; index < geometry.getAttribute('position').count; index += 1) {
    if (vertexAt(geometry, index, 1, point).y > bestY) {
      bestY = point.y;
      best = index;
    }
  }
  return best;
}

/** Reads species subtrees (meshes named "<species>_<part>" with growth extras) into part templates. */
export function readPlantModels(scene: Object3D): PlantModels {
  const parts = new Map<SpeciesId, PartTemplate[]>();
  const owned: BufferGeometry[] = [];
  scene.updateMatrixWorld(true);
  for (const species of SPECIES) {
    const root = scene.getObjectByName(species);
    if (!root) throw new Error(`Plant model "${species}" is missing`);
    const list: PartTemplate[] = [];
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const extras = object.userData as { grow_start?: unknown; grow_end?: unknown; attach?: unknown; ripe?: unknown; fly?: unknown };
      if (typeof extras.grow_start !== 'number' || typeof extras.grow_end !== 'number') {
        throw new Error(`Plant mesh "${object.name}" has no growth window`);
      }
      const geometry = (object.geometry as BufferGeometry).clone();
      // Keep the pivot: bake only rotation and scale. Relative morph deltas follow the same linear part.
      const linear = new Matrix3().setFromMatrix4(object.matrix);
      geometry.applyMatrix4(new Matrix4().setFromMatrix3(linear));
      for (const delta of geometry.morphAttributes.position ?? []) if (delta instanceof BufferAttribute) delta.applyMatrix3(linear);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      owned.push(geometry);
      const top = topIndex(geometry);
      const grownBox = new Box3();
      const point = new Vector3();
      for (let index = 0; index < geometry.getAttribute('position').count; index += 1) {
        grownBox.expandByPoint(vertexAt(geometry, index, 1, point));
      }
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      list.push({
        name: object.name,
        geometry,
        color: paletteColor(material?.name ?? ''),
        origin: object.position.clone(),
        growStart: extras.grow_start,
        growEnd: extras.grow_end,
        attach: typeof extras.attach === 'string' ? extras.attach : '',
        ripe: extras.ripe === true,
        fly: extras.fly === true,
        morph: Boolean(geometry.morphAttributes.position?.length),
        seedTop: vertexAt(geometry, top, 0, new Vector3()),
        grownTop: vertexAt(geometry, top, 1, new Vector3()),
        grownCenter: grownBox.getCenter(new Vector3()),
      });
    });
    for (const part of list) {
      if (part.attach && !list.some(({ name }) => name === part.attach)) {
        throw new Error(`Plant mesh "${part.name}" rides missing part "${part.attach}"`);
      }
    }
    parts.set(species, list);
  }
  return {
    parts,
    dispose() {
      for (const geometry of owned.splice(0)) geometry.dispose();
    },
  };
}

export async function loadPlantModels(url: string): Promise<PlantModels> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const models = readPlantModels(gltf.scene);
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) {
      (object.geometry as BufferGeometry).dispose();
      for (const material of [object.material].flat()) material.dispose();
    }
  });
  return models;
}

export const PLANT_MODEL_URL = `${import.meta.env.BASE_URL}models/plants.glb`;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
/** Ease-out with a small overshoot, so each part pops slightly past its size and settles. */
const backOut = (value: number) => {
  const t = clamp01(value) - 1;
  return Math.max(0, 1 + 2.2 * t * t * t + 1.2 * t * t);
};

/** Growth of one part at overall progress: its own window, eased with a small overshoot (motion.md 4.2). */
export function partGrowth(part: Pick<PartTemplate, 'growStart' | 'growEnd'>, progress: number): number {
  return backOut((progress - part.growStart) / Math.max(1e-6, part.growEnd - part.growStart));
}

export function createAuthoredRig(
  species: SpeciesId,
  models: PlantModels,
  materials: MaterialLibrary,
  phaseOffsetMs = 0,
  hopPhaseOffsetMs = 0,
): PlantRig {
  const root = new Group();
  root.name = species;
  const body = new Group();
  body.name = 'plant-body';
  root.add(body);
  const scale = SPECIES_SCALE[species];
  const fruitRamp = palette.plants[species].fruit;
  const base = materials.toon(fruitRamp[1]);
  const fruitMaterial = base.clone() as MeshToonMaterial;
  fruitMaterial.onBeforeCompile = base.onBeforeCompile;
  fruitMaterial.customProgramCacheKey = base.customProgramCacheKey;
  const unripe = new Color(fruitRamp[3]);
  const ripeColor = new Color(fruitRamp[1]);

  const animated: { meshes: Mesh[]; part: PartTemplate; growth: number }[] = [];
  for (const part of models.parts.get(species) ?? []) {
    const mesh = new Mesh(part.geometry, part.ripe ? fruitMaterial : materials.toon(part.color));
    mesh.name = part.name;
    mesh.userData.part = part.name;
    mesh.renderOrder = 3;
    const hull = materials.outline(part.geometry);
    hull.userData.part = `${part.name}-outline`;
    hull.renderOrder = 2;
    body.add(mesh, hull);
    animated.push({ meshes: [mesh, hull], part, growth: 0 });
  }
  const byName = new Map(animated.map((entry) => [entry.part.name, entry]));
  const ride = new Vector3();

  // Watered soil stays darker for the rest of the plant's growth (motion.md 4.6).
  const wetGeometry = new CircleGeometry(0.62, 28);
  const wetMaterial = new MeshBasicMaterial({ color: palette.environment['soil-wet'][1], transparent: true, opacity: 0.75,
    depthWrite: false, toneMapped: false });
  const wet = new Mesh(wetGeometry, wetMaterial);
  wet.name = 'wet-soil';
  wet.userData.part = 'blob';
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.006;
  wet.renderOrder = 1;
  wet.visible = false;
  root.add(wet);
  let lastStage: string | null = null;
  let popStartMs = -Infinity;
  let wetStartMs = -Infinity;

  const blob = materials.blob();
  blob.name = 'blob';
  blob.userData.part = 'blob';
  blob.position.y = 0.008;
  blob.rotation.x = -Math.PI / 2;
  root.add(blob);

  let disposed = false;
  return {
    root,
    update(plant, presentationNowMs, reducedMotion) {
      const progress = clamp01(plant.progress);
      const ripe = plant.stage === 'Harvestable';
      // Fruit warms part way while growing and only reaches its ripe colour and size when harvestable,
      // so ripeness is an obvious change rather than the end of a gradient (motion.md 4.3).
      const warm = ripe ? 1 : 0.6 * smooth(clamp01((progress - 0.5) / 0.5));
      fruitMaterial.color.copy(unripe).lerp(ripeColor, warm);
      for (const entry of animated) entry.growth = partGrowth(entry.part, progress);
      for (const { meshes, part, growth } of animated) {
        // Attached parts ride their parent's tip: offset by how far that tip is from its grown place.
        ride.set(0, 0, 0);
        const parent = part.attach ? byName.get(part.attach) : undefined;
        if (parent) ride.copy(parent.part.seedTop).lerp(parent.part.grownTop, parent.growth).sub(parent.part.grownTop);
        const size = part.morph ? 1 : growth * (ripe && part.fly ? RIPE_SWELL : 1);
        for (const mesh of meshes) {
          if (part.morph) mesh.morphTargetInfluences![0] = growth;
          mesh.visible = size > 0.001;
          mesh.scale.setScalar(Math.max(0.001, size));
          mesh.position.copy(part.origin).add(ride);
        }
      }

      if (lastStage !== null && lastStage !== plant.stage) popStartMs = presentationNowMs;
      lastStage = plant.stage;
      if (plant.boostMs !== undefined && !wet.visible) {
        wet.visible = true;
        wetStartMs = presentationNowMs;
      }
      wet.scale.setScalar(reducedMotion ? 1 : 0.2 + 0.8 * smooth(clamp01((presentationNowMs - wetStartMs) / 300)));

      const hop = ripeHopPose(presentationNowMs, hopPhaseOffsetMs, ripe && !reducedMotion);
      const drop = reducedMotion ? { y: 0, squash: 1 } : seedDrop(presentationNowMs - plant.plantedAt);
      // Stage crossings pop 10% and settle (motion.md 4.2); reduced motion skips the pop.
      const popT = presentationNowMs - popStartMs;
      const pop = reducedMotion || popT > 400 ? 1 : 1 + 0.1 * Math.exp(-popT / 70) * Math.cos(popT / 28);
      const squash = hop.scaleY * drop.squash;
      body.position.y = hop.y + drop.y;
      body.scale.set(pop / Math.sqrt(squash), squash * pop, pop / Math.sqrt(squash));
      // Ripe plants wiggle every 3 s (motion.md 4.3).
      const wiggleT = (((presentationNowMs + hopPhaseOffsetMs + 1500) % 3000) + 3000) % 3000 / 400;
      body.rotation.z = ripe && !reducedMotion && wiggleT < 1 ? 0.1 * Math.sin(wiggleT * Math.PI * 3) * (1 - wiggleT) : 0;
      const breathing = reducedMotion ? 1 : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02;
      root.scale.set(scale, scale * breathing, scale);
      const size = 0.35 + 0.65 * smooth(progress);
      const lift = 1 - 0.25 * Math.min(1, hop.y / 0.05);
      blob.scale.set(0.95 * size * lift, 0.95 * size * lift, 1);
    },
    getTop(target) {
      let found = false;
      const point = new Vector3();
      for (const { meshes, part, growth } of animated) {
        const mesh = meshes[0]!;
        if (!mesh.visible) continue;
        point.copy(part.seedTop).lerp(part.grownTop, part.morph ? growth : 1);
        mesh.updateWorldMatrix(true, false);
        point.applyMatrix4(mesh.matrixWorld);
        if (!found || point.y > target.y) target.copy(point);
        found = true;
      }
      // Height of the highest part, centred over the plant so stamps sit on its axis, not a leaf tip.
      if (found) {
        const y = target.y;
        root.getWorldPosition(target).setY(y);
      }
      return found;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fruitMaterial.dispose();
      wetGeometry.dispose();
      wetMaterial.dispose();
      root.clear();
    },
  };
}
