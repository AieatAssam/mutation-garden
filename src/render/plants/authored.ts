import { Box3, BufferAttribute, BufferGeometry, CircleGeometry, Color, Group, Matrix3, Mesh, MeshBasicMaterial, MeshToonMaterial, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SpeciesId } from '../../sim';
import type { MaterialLibrary } from '../materials';
import { palette } from '../palette';
import { paletteColor } from '../scenery';
import { ripeHopPose, type PlantRig } from './sunny-sprout';

/** Growth channels authored in tools/blender/build_plants.py, each with one "grow" morph target. */
type Channel = 'stem' | 'leaf' | 'fruit' | 'cap';

interface PartTemplate {
  readonly channel: Channel;
  readonly geometry: BufferGeometry;
  readonly color: string;
  /** Exact highest point of the seedling and fully grown shapes (three's morph bounds over-estimate). */
  readonly seedTop: Vector3;
  readonly grownTop: Vector3;
  /** Centre of the fully grown shape; ripe fruit swells about it. */
  readonly grownCenter: Vector3;
}

function grownCenter(geometry: BufferGeometry): Vector3 {
  const position = geometry.getAttribute('position');
  const delta = geometry.morphAttributes.position![0]!;
  const box = new Box3();
  const point = new Vector3();
  for (let index = 0; index < position.count; index += 1) {
    box.expandByPoint(point.set(position.getX(index) + delta.getX(index), position.getY(index) + delta.getY(index),
      position.getZ(index) + delta.getZ(index)));
  }
  return box.getCenter(point.clone());
}

function highestPoint(geometry: BufferGeometry, influence: number): Vector3 {
  const position = geometry.getAttribute('position');
  const delta = geometry.morphAttributes.position![0]!;
  const top = new Vector3(0, -Infinity, 0);
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index) + delta.getY(index) * influence;
    if (y > top.y) top.set(position.getX(index) + delta.getX(index) * influence, y,
      position.getZ(index) + delta.getZ(index) * influence);
  }
  return top;
}

export interface PlantModels {
  readonly parts: ReadonlyMap<SpeciesId, readonly PartTemplate[]>;
  dispose(): void;
}

const SPECIES: readonly SpeciesId[] = ['sunny-sprout', 'bubble-berry', 'twistroot'];
/** Display size per species, tuned so each plant fills its bed at phone size. */
export const SPECIES_SCALE: Readonly<Record<SpeciesId, number>> = { 'sunny-sprout': 1.15, 'bubble-berry': 1.5, twistroot: 1.45 };

/** Reads species subtrees (meshes named "<species>_<channel>[_n]") into reusable part templates. */
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
      const channel = /_(stem|leaf|fruit|cap)(?:_\d+)?$/.exec(object.name)?.[1] as Channel | undefined;
      if (!channel) throw new Error(`Plant mesh "${object.name}" has no growth channel`);
      const geometry = (object.geometry as BufferGeometry).clone();
      // Bake the mesh's transform inside its species root. glTF morph targets are relative deltas,
      // which only need the linear part of the transform.
      geometry.applyMatrix4(object.matrix);
      const linear = new Matrix3().setFromMatrix4(object.matrix);
      for (const delta of geometry.morphAttributes.position ?? []) if (delta instanceof BufferAttribute) delta.applyMatrix3(linear);
      if (!geometry.morphAttributes.position?.length) throw new Error(`Plant mesh "${object.name}" has no grow morph`);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      owned.push(geometry);
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      list.push({ channel, geometry, color: paletteColor(material?.name ?? ''),
        seedTop: highestPoint(geometry, 0), grownTop: highestPoint(geometry, 1), grownCenter: grownCenter(geometry) });
    });
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
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
/** Ease-out with a small overshoot, so each part pops slightly past its size and settles. */
const backOut = (value: number) => {
  const t = clamp01(value) - 1;
  return Math.max(0, 1 + 2.2 * t * t * t + 1.2 * t * t);
};

/** Each part grows in its own window of overall progress (overlapping action, motion.md 4.2). */
export function channelInfluence(channel: Channel, progress: number): number {
  switch (channel) {
    case 'stem': return backOut(progress / 0.55);
    case 'leaf': return backOut((progress - 0.12) / 0.55);
    case 'fruit':
    case 'cap': return backOut((progress - 0.4) / 0.6);
  }
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
  const fruitMaterial = materials.toon(fruitRamp[1]).clone() as MeshToonMaterial;
  const base = materials.toon(fruitRamp[1]);
  fruitMaterial.onBeforeCompile = base.onBeforeCompile;
  fruitMaterial.customProgramCacheKey = base.customProgramCacheKey;
  const unripe = new Color(fruitRamp[3]);
  const ripeColor = new Color(fruitRamp[1]);

  const animated: { channel: Channel; meshes: Mesh[]; part: PartTemplate }[] = [];
  for (const part of models.parts.get(species) ?? []) {
    const mesh = new Mesh(part.geometry, part.channel === 'fruit' ? fruitMaterial : materials.toon(part.color));
    mesh.name = `${species}-${part.channel}`;
    mesh.userData.part = part.channel;
    mesh.renderOrder = 3;
    const hull = materials.outline(part.geometry);
    hull.userData.part = `${part.channel}-outline`;
    hull.renderOrder = 2;
    body.add(mesh, hull);
    animated.push({ channel: part.channel, meshes: [mesh, hull], part });
  }

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
      for (const { channel, meshes } of animated) {
        const influence = channelInfluence(channel, progress);
        for (const mesh of meshes) mesh.morphTargetInfluences![0] = influence;
      }
      const ripe = plant.stage === 'Harvestable';
      // Fruit warms part way while growing and only reaches its ripe colour and size when harvestable,
      // so ripeness is an obvious change rather than the end of a gradient (motion.md 4.3).
      const warm = ripe ? 1 : 0.6 * smooth(clamp01((progress - 0.5) / 0.5));
      fruitMaterial.color.copy(unripe).lerp(ripeColor, warm);
      const swell = ripe ? RIPE_SWELL : 1;
      for (const { channel, meshes, part } of animated) {
        if (channel !== 'fruit' && channel !== 'cap') continue;
        for (const mesh of meshes) {
          mesh.scale.setScalar(swell);
          mesh.position.copy(part.grownCenter).multiplyScalar(1 - swell);
        }
      }

      if (lastStage !== null && lastStage !== plant.stage) popStartMs = presentationNowMs;
      lastStage = plant.stage;
      if (plant.boostMs !== undefined && !wet.visible) {
        wet.visible = true;
        wetStartMs = presentationNowMs;
      }
      const wetT = clamp01((presentationNowMs - wetStartMs) / 300);
      wet.scale.setScalar(reducedMotion ? 1 : 0.2 + 0.8 * smooth(wetT));

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
      for (const { meshes, part } of animated) {
        const influence = meshes[0]!.morphTargetInfluences![0]!;
        const point = part.seedTop.clone().lerp(part.grownTop, influence);
        meshes[0]!.updateWorldMatrix(true, false);
        point.applyMatrix4(meshes[0]!.matrixWorld);
        if (!found || point.y > target.y) target.copy(point);
        found = true;
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
