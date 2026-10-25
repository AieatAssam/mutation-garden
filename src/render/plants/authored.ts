import { Box3, BufferAttribute, BufferGeometry, CircleGeometry, Color, DoubleSide, Group, Matrix3, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, MeshToonMaterial, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SpeciesId } from '../../sim';
import type { MaterialLibrary } from '../materials';
import { palette } from '../palette';
import { paletteColor } from '../scenery';
import { windAt } from '../motion/wind';
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

const SPECIES: readonly SpeciesId[] = ['sunny-sprout', 'bubble-berry', 'twistroot', 'puffcap', 'lantern-pod', 'comet-pear', 'clockvine', 'dewbell', 'prism-fig', 'sunburst'];
const MODEL_FALLBACK: Partial<Record<SpeciesId, SpeciesId>> = {
  'lantern-pod': 'bubble-berry', 'comet-pear': 'sunny-sprout', clockvine: 'twistroot', dewbell: 'puffcap', 'prism-fig': 'twistroot', sunburst: 'sunny-sprout',
};
/** Display size per species, tuned so each plant fills its bed at phone size. */
export const SPECIES_SCALE: Readonly<Record<SpeciesId, number>> = { 'sunny-sprout': 1.15, 'bubble-berry': 1.5, twistroot: 1.4, puffcap: 1.25, 'lantern-pod': 1.35, 'comet-pear': 1.25, clockvine: 1.35, dewbell: 1.25, 'prism-fig': 1.35, sunburst: 1.35 };
const RIPE_SWELL = 1.14;
/** Harvested parts show their rolled yield size (design.md 4.3). */
export const YIELD_SCALE = { small: 0.88, regular: 1, big: 1.2 } as const;
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
    const root = scene.getObjectByName(species) ?? scene.getObjectByName(MODEL_FALLBACK[species] ?? '');
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
  const loader = new GLTFLoader();
  const [gltf, lab] = await Promise.all([
    loader.loadAsync(url),
    loader.loadAsync(`${import.meta.env.BASE_URL}models/lab-plants.glb`).catch(() => null),
  ]);
  const scene = new Group();
  scene.add(gltf.scene);
  if (lab) scene.add(lab.scene);
  const models = readPlantModels(scene);
  scene.traverse((object) => {
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

const WIND_LEAN = 0.025;

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
  const goldenMaterial = new MeshStandardMaterial({ color: palette.ui.coin.face, metalness: 0.82, roughness: 0.22 });
  const glowingMaterial = new MeshStandardMaterial({ color: palette.mutations.glowing.core, emissive: palette.mutations.glowing.emissive, emissiveIntensity: 0.8, roughness: 0.8 });
  const crystalMaterial = new MeshPhysicalMaterial({ color: palette.mutations.crystal.body, transmission: 0.92, thickness: 0.6,
    ior: 1.45, roughness: 0.04, attenuationColor: new Color(palette.mutations.crystal.attenuation), attenuationDistance: 0.8, flatShading: true });
  const frozenMaterial = new MeshPhysicalMaterial({ color: palette.mutations.crystal.body, metalness: 0.15, roughness: 0.28, flatShading: true });
  const frozenUniforms: { value: number }[] = [];
  frozenMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.frostProgress = { value: 1 };
    frozenUniforms.push(shader.uniforms.frostProgress as { value: number });
    shader.vertexShader = `varying vec3 vFrostPosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFrostPosition = transformed;');
    shader.fragmentShader = `uniform float frostProgress;\nvarying vec3 vFrostPosition;\n${shader.fragmentShader}`.replace('#include <color_fragment>',
      `#include <color_fragment>\nfloat frostEdge = 1.0 - smoothstep(0.0, 0.06, abs(vFrostPosition.y - frostProgress * 1.4));\nfloat frostFacet = step(0.72, fract((vFrostPosition.x * 3.1 + vFrostPosition.y * 2.7 + vFrostPosition.z * 2.3) * 3.0));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${new Color(palette.mutations.crystal.edge).r.toFixed(3)}, ${new Color(palette.mutations.crystal.edge).g.toFixed(3)}, ${new Color(palette.mutations.crystal.edge).b.toFixed(3)}), max(frostEdge * 0.7, frostFacet * step(vFrostPosition.y, frostProgress * 1.4) * 0.22));`);
  };
  frozenMaterial.customProgramCacheKey = () => 'frozen-facet-wipe-v1';
  const electricMaterial = new MeshStandardMaterial({ color: palette.ui.coin.face, emissive: palette.ui.coin.face, emissiveIntensity: 0.45, roughness: 0.45 });
  const twinMaterial = new MeshStandardMaterial({ color: palette.plants.twistroot.fruit[1], roughness: 0.65, flatShading: true });
  const electricUniforms: { value: number }[] = [];
  electricMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.electricPulse = { value: 0.45 };
    electricUniforms.push(shader.uniforms.electricPulse as { value: number });
    shader.vertexShader = `varying vec3 vElectricPosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvElectricPosition = transformed;');
    shader.fragmentShader = `uniform float electricPulse;\nvarying vec3 vElectricPosition;\n${shader.fragmentShader}`.replace('#include <color_fragment>',
      `#include <color_fragment>\nfloat veinA = 1.0 - smoothstep(0.018, 0.045, abs(vElectricPosition.x - 0.22 * sin(vElectricPosition.y * 6.0)));\nfloat veinB = 1.0 - smoothstep(0.018, 0.045, abs(vElectricPosition.x + 0.22 * sin(vElectricPosition.y * 6.0)));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${new Color(palette.mutations.golden.highlight).r.toFixed(3)}, ${new Color(palette.mutations.golden.highlight).g.toFixed(3)}, ${new Color(palette.mutations.golden.highlight).b.toFixed(3)}), max(veinA, veinB) * electricPulse);`);
  };
  electricMaterial.customProgramCacheKey = () => 'electric-veins-v1';
  const crystalFresnel = new MeshStandardMaterial({ color: palette.mutations.crystal.deep, transparent: true, opacity: 0.72, metalness: 0.35, roughness: 0.22, side: DoubleSide });
  crystalFresnel.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vCrystalNormal;\n${shader.vertexShader}`.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvCrystalNormal = normalize(normalMatrix * objectNormal);');
    shader.fragmentShader = `varying vec3 vCrystalNormal;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\nfloat crystalEdge = pow(1.0 - abs(normalize(vCrystalNormal).z), 2.0); diffuseColor.a = mix(0.55, 0.95, crystalEdge);');
  };
  crystalFresnel.customProgramCacheKey = () => 'crystal-fresnel-fallback-v1';
  const traitIds = ['crystal', 'giant', 'glowing', 'golden', 'rainbow', 'frozen', 'electric', 'twin'] as const;
  const traitColor = (trait: typeof traitIds[number]) => trait === 'giant' ? palette.mutations.giant.tint
    : trait === 'golden' ? palette.mutations.golden.base : trait === 'glowing' ? palette.mutations.glowing.core
      : trait === 'crystal' || trait === 'frozen' ? palette.mutations.crystal.body
        : trait === 'electric' ? palette.ui.coin.face : trait === 'twin' ? palette.plants.twistroot.fruit[1] : palette.mutations.rainbow[0];
  const rainbowTimeUniforms: { value: number }[] = [];
  const goldenGleamUniforms: { value: number }[] = [];
  const glowingMaterials: MeshStandardMaterial[] = [glowingMaterial];
  const rainbowMaterial = new MeshPhysicalMaterial({ color: palette.ink['paper-white'], metalness: 0.3, roughness: 0.18, iridescence: 0.5,
    iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 800] });
  rainbowMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.rainbowBands = { value: palette.mutations.rainbow.map((color) => new Color(color)) };
    shader.uniforms.rainbowTime = { value: 0 };
    rainbowTimeUniforms.push(shader.uniforms.rainbowTime as { value: number });
    shader.vertexShader = `varying float vRainbowHeight;\n${shader.vertexShader}`.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvRainbowHeight = normalize(objectNormal).y;');
    shader.fragmentShader = `uniform vec3 rainbowBands[6];\nuniform float rainbowTime;\nvarying float vRainbowHeight;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\nfloat band = mod(floor((1.0 - vRainbowHeight) * 3.0 + rainbowTime * 6.0), 6.0); diffuseColor.rgb = mix(diffuseColor.rgb, rainbowBands[int(band)], 0.9);');
  };
  rainbowMaterial.customProgramCacheKey = () => 'rainbow-bands-v1';
  goldenMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uGleam = { value: 0 };
    goldenGleamUniforms.push(shader.uniforms.uGleam as { value: number });
    shader.vertexShader = `varying vec3 vGoldenPosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGoldenPosition = transformed;');
    shader.fragmentShader = `uniform float uGleam;\nvarying vec3 vGoldenPosition;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\nfloat gleam = 1.0 - smoothstep(0.0, 0.12, abs(vGoldenPosition.x - (uGleam * 2.0 - 1.0)));\ndiffuseColor.rgb += vec3(1.0) * gleam * 0.45;');
  };
  goldenMaterial.customProgramCacheKey = () => 'golden-fruit-gleam-v1';
  const pairMaterials = new Map<string, MeshStandardMaterial | MeshPhysicalMaterial | MeshToonMaterial>();
  const pairFallbackMaterials = new Map<string, MeshStandardMaterial>();
  const pairBaseTraits = new Map<string, typeof traitIds[number]>();
  const baseMaterials = { crystal: crystalMaterial, giant: fruitMaterial, glowing: glowingMaterial, golden: goldenMaterial, rainbow: rainbowMaterial, frozen: frozenMaterial, electric: electricMaterial, twin: twinMaterial };
  const rank = { giant: 0, glowing: 1, golden: 2, crystal: 3, frozen: 4, electric: 5, twin: 6, rainbow: 7 };
  for (const [index, first] of traitIds.entries()) for (const second of traitIds.slice(index + 1)) {
    const [baseTrait, accentTrait] = rank[first] > rank[second] ? [first, second] : [second, first];
    const key = [first, second].sort().join('+');
    const createPairMaterial = (baseMaterial: MeshStandardMaterial | MeshPhysicalMaterial | MeshToonMaterial, suffix = '') => {
      const material = baseMaterial.clone();
      const baseCompile = baseMaterial.onBeforeCompile;
      const baseProgramKey = baseMaterial.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        baseCompile.call(material, shader, renderer);
        shader.uniforms.pairAccent = { value: new Color(traitColor(accentTrait)) };
        shader.vertexShader = `varying vec3 vPairPosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPairPosition = transformed;');
        shader.fragmentShader = `uniform vec3 pairAccent;\nvarying vec3 vPairPosition;\n${shader.fragmentShader}`.replace('#include <color_fragment>', '#include <color_fragment>\nfloat pairBand = step(0.5, fract((vPairPosition.x + vPairPosition.y * 0.37) * 5.0)); diffuseColor.rgb = mix(diffuseColor.rgb, pairAccent, pairBand * 0.42);');
      };
      material.customProgramCacheKey = () => `${baseProgramKey}-trait-pair-${key}${suffix}-v1`;
      return material;
    };
    const material = createPairMaterial(baseMaterials[baseTrait]);
    if (baseTrait === 'crystal') pairFallbackMaterials.set(key, createPairMaterial(crystalFresnel, '-fresnel') as MeshStandardMaterial);
    if (baseTrait === 'glowing') glowingMaterials.push(material as MeshStandardMaterial);
    pairMaterials.set(key, material);
    pairBaseTraits.set(key, baseTrait);
  }
  fruitMaterial.onBeforeCompile = base.onBeforeCompile;
  fruitMaterial.customProgramCacheKey = base.customProgramCacheKey;
  const unripe = new Color(fruitRamp[3]);
  const ripeColor = new Color(fruitRamp[1]);

  const animated: { meshes: Mesh[]; part: PartTemplate; growth: number; scale: number }[] = [];
  for (const part of models.parts.get(species) ?? []) {
    const mesh = new Mesh(part.geometry, part.ripe ? fruitMaterial : materials.toon(part.color));
    mesh.name = part.name;
    mesh.userData.part = part.name;
    mesh.renderOrder = 3;
    const hull = materials.outline(part.geometry);
    hull.userData.part = `${part.name}-outline`;
    hull.renderOrder = 2;
    body.add(mesh, hull);
    animated.push({ meshes: [mesh, hull], part, growth: 0, scale: 1 });
  }
  const twinSource = animated.find(({ part }) => part.ripe)?.meshes[0];
  const twinFruit = twinSource ? new Mesh(twinSource.geometry, twinMaterial) : null;
  if (twinFruit) {
    twinFruit.name = 'twin-fruit'; twinFruit.renderOrder = 3;
    body.add(twinFruit);
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
  let giant: boolean | null = null;
  let giantStartMs = -Infinity;
  let giantFrom = 1;
  let shiverStartMs = -Infinity;
  let shiverDurationMs = 0;
  let lastFrozen = false;
  let lastElectric = false;
  let lastTwin = false;
  let frozenStartMs = -Infinity;
  let electricStartMs = -Infinity;
  let twinStartMs = -Infinity;

  const blob = materials.blob();
  blob.name = 'blob';
  blob.userData.part = 'blob';
  blob.position.y = 0.008;
  blob.rotation.x = -Math.PI / 2;
  root.add(blob);

  let disposed = false;
  return {
    root,
    update(plant, presentationNowMs, reducedMotion, crystalTransmissionSlots = Infinity) {
      const progress = clamp01(plant.progress);
      const hasGiant = plant.mutations?.includes('giant') ?? false;
      const golden = plant.mutations?.includes('golden') ?? false;
      const glowing = plant.mutations?.includes('glowing') ?? false;
      const crystal = plant.mutations?.includes('crystal') ?? false;
      const rainbow = plant.mutations?.includes('rainbow') ?? false;
      const frozen = plant.mutations?.includes('frozen') ?? false;
      const electric = plant.mutations?.includes('electric') ?? false;
      const twin = plant.mutations?.includes('twin') ?? false;
      if (frozen && !lastFrozen) frozenStartMs = presentationNowMs;
      if (electric && !lastElectric) electricStartMs = presentationNowMs;
      if (twin && !lastTwin) twinStartMs = presentationNowMs;
      lastFrozen = frozen; lastElectric = electric; lastTwin = twin;
      const mutations = plant.mutations ?? [];
      const pairKey = mutations.length === 2 ? [...mutations].sort().join('+') : '';
      const pair = pairMaterials.get(pairKey);
      const pairBase = pairBaseTraits.get(pairKey);
      const frozenProgress = frozen ? reducedMotion ? 1 : clamp01((presentationNowMs - frozenStartMs) / 500) : 1;
      for (const uniform of frozenUniforms) uniform.value = frozenProgress;
      for (const material of glowingMaterials) material.emissiveIntensity = glowing ? (reducedMotion ? 0.8 : 0.55 + 0.3 * Math.sin(presentationNowMs / 350)) : 0;
      const electricAge = presentationNowMs - electricStartMs;
      const electricArc = electric && !reducedMotion && electricAge < 510 && (electricAge < 350 || electricAge >= 80 && electricAge < 430)
        ? Math.max(0, Math.sin((electricAge % 350) / 350 * Math.PI)) : 0;
      for (const uniform of electricUniforms) uniform.value = reducedMotion ? 0.65 : electricArc || (electric ? 0.35 + 0.3 * Math.max(0, Math.sin(presentationNowMs * Math.PI * 2 / 1000)) : 0);
      const gleam = reducedMotion ? 0.5 : ((presentationNowMs % 3000) + 3000) % 3000 / 3000;
      for (const uniform of goldenGleamUniforms) uniform.value = gleam;
      for (const uniform of rainbowTimeUniforms) uniform.value = reducedMotion ? 0 : (((presentationNowMs % 3000) + 3000) % 3000) / 3000;
      if (giant === null) giant = hasGiant;
      else if (giant !== hasGiant) {
        giantFrom = hasGiant ? 1 : 1.8;
        giant = hasGiant;
        giantStartMs = presentationNowMs;
      }
      const ripe = plant.stage === 'Harvestable';
      // Fruit warms part way while growing and only reaches its ripe colour and size when harvestable,
      // so ripeness is an obvious change rather than the end of a gradient (motion.md 4.3).
      const warm = ripe ? 1 : 0.6 * smooth(clamp01((progress - 0.5) / 0.5));
      fruitMaterial.color.copy(unripe).lerp(ripeColor, warm);
      const yieldScale = YIELD_SCALE[plant.size ?? 'regular'];
      // Plants lean with the shared wind at their world x (m1-liveliness.md 4.1); last frame's matrix is close enough.
      const wind = reducedMotion ? 0 : windAt(root.matrixWorld.elements[12]!, presentationNowMs);
      for (const entry of animated) {
        entry.growth = partGrowth(entry.part, progress);
        entry.scale = entry.part.fly ? yieldScale : 1;
      }
      let crystalTransmissionUsed = 0;
      for (const { meshes, part, growth, scale: partScale } of animated) {
        // Attached parts ride their parent's tip: offset by how far that tip is from its grown place.
        ride.set(0, 0, 0);
        const parent = part.attach ? byName.get(part.attach) : undefined;
        if (parent) {
          ride.copy(parent.part.seedTop).lerp(parent.part.grownTop, parent.growth).multiplyScalar(parent.scale)
            .sub(parent.part.grownTop);
        }
        const size = (part.morph ? 1 : growth * (ripe && part.fly ? RIPE_SWELL : 1)) * partScale;
        const fruitVisible = size > 0.001 && (!part.morph || growth > 0 || part.growStart === 0);
        const transmitsCrystal = crystal && !rainbow && (!pair || pairBase === 'crystal');
        const transmitCrystal = transmitsCrystal && part.ripe && fruitVisible && crystalTransmissionUsed < crystalTransmissionSlots;
        if (transmitCrystal) crystalTransmissionUsed += 1;
        if (part.ripe) {
          meshes[0]!.material = pair ? pairBase === 'crystal' && !transmitCrystal ? pairFallbackMaterials.get(pairKey)! : pair
            : (twin ? twinMaterial : electric ? electricMaterial : frozen ? frozenMaterial : rainbow ? rainbowMaterial : crystal ? transmitCrystal ? crystalMaterial : crystalFresnel : golden ? goldenMaterial : glowing ? glowingMaterial : fruitMaterial);
          if (pairBase === 'giant') (meshes[0]!.material as MeshToonMaterial).color.copy(fruitMaterial.color);
          if (pairBase === 'glowing') (meshes[0]!.material as MeshStandardMaterial).emissiveIntensity = glowingMaterial.emissiveIntensity;
        }
        // Leaves flutter on their pivot, faster and smaller than the whole-plant lean (motion.md 2, Wind).
        const flutter = !reducedMotion && part.name.includes('_leaf')
          ? 0.05 * Math.sin(((presentationNowMs + phaseOffsetMs) / 400) * Math.PI * 2) * (0.5 + 0.5 * Math.abs(wind))
          : 0;
        for (const [index, mesh] of meshes.entries()) {
          mesh.rotation.z = flutter;
          if (part.morph) mesh.morphTargetInfluences![0] = growth;
          mesh.visible = size > 0.001 && (!part.morph || growth > 0 || part.growStart === 0)
            && !((golden || crystal || rainbow || frozen || electric || twin) && part.ripe && index === 1);
          mesh.scale.setScalar(Math.max(0.001, size));
          mesh.position.copy(part.origin).add(ride);
        }
      }
      if (twinFruit && twinSource) {
        twinFruit.visible = twin && (plant.stage === 'Mature' || ripe);
        twinFruit.material = pair ? pair as MeshStandardMaterial : twinMaterial;
        twinFruit.position.copy(twinSource.position);
        twinFruit.position.x += 0.32;
        twinFruit.scale.copy(twinSource.scale);
        twinFruit.scale.x *= -1;
        const twinAge = presentationNowMs - twinStartMs;
        const twinPop = reducedMotion ? 1 : smooth(clamp01((twinAge - 100) / 180));
        twinFruit.scale.multiplyScalar(twinPop);
        if (twinSource.morphTargetInfluences && twinFruit.morphTargetInfluences) twinFruit.morphTargetInfluences.splice(0, twinFruit.morphTargetInfluences.length, ...twinSource.morphTargetInfluences);
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
      const wiggle = ripe && !reducedMotion && wiggleT < 1 ? 0.1 * Math.sin(wiggleT * Math.PI * 3) * (1 - wiggleT) : 0;
      // Wind blows along +x, so a plant leans towards -z rotation; the ripe wiggle adds on top.
      body.rotation.z = wiggle - WIND_LEAN * wind;
      const breathing = reducedMotion ? 1 : 1 + Math.sin(((presentationNowMs + phaseOffsetMs) / 2400) * Math.PI * 2) * 0.02;
      let giantScale = hasGiant ? 1.8 : 1;
      if (giantStartMs !== -Infinity) {
        const duration = reducedMotion ? 300 : 600;
        const t = clamp01((presentationNowMs - giantStartMs) / duration);
        if (t >= 1) giantStartMs = -Infinity;
        else if (reducedMotion) giantScale = giantFrom + (hasGiant ? 1.8 - giantFrom : 1 - giantFrom) * smooth(t);
        else {
          const target = hasGiant ? 1.8 : 1;
          const direction = target >= giantFrom ? 1 : -1;
          giantScale = giantFrom + (target - giantFrom) * smooth(t)
            + direction * 0.14 * Math.sin(t * Math.PI * 4) * (1 - t);
          giantScale = Math.max(0.1, giantScale);
        }
      }
      const shiver = !reducedMotion && presentationNowMs - shiverStartMs < shiverDurationMs
        ? 0.055 * Math.sin(((presentationNowMs - shiverStartMs) / 42) * Math.PI * 2)
          * (1 - clamp01((presentationNowMs - shiverStartMs) / shiverDurationMs)) : 0;
      root.rotation.z = shiver;
      root.scale.set(scale * giantScale, scale * giantScale * breathing, scale * giantScale);
      const size = 0.35 + 0.65 * smooth(progress);
      const lift = 1 - 0.25 * Math.min(1, hop.y / 0.05);
      blob.scale.set(0.95 * size * lift, 0.95 * size * lift, 1);
      return crystalTransmissionUsed;
    },
    shiver(presentationNowMs, durationMs) {
      shiverStartMs = presentationNowMs;
      shiverDurationMs = durationMs;
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
      goldenMaterial.dispose(); frozenMaterial.dispose(); electricMaterial.dispose(); twinMaterial.dispose();
      glowingMaterial.dispose();
      crystalMaterial.dispose(); crystalFresnel.dispose(); rainbowMaterial.dispose();
      for (const material of pairMaterials.values()) material.dispose();
      for (const material of pairFallbackMaterials.values()) material.dispose();
      wetGeometry.dispose();
      wetMaterial.dispose();
      root.clear();
    },
  };
}
