import { BufferGeometry, Color, Float32BufferAttribute, Group, type Matrix4, Mesh, MeshBasicMaterial, type MeshToonMaterial, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MaterialLibrary } from './materials';
import { palette } from './palette';
import { gustAt, WIND_PERIOD_MS, WIND_SPEED } from './motion/wind';
import { GROUND_SURFACE } from './garden';

/** Resolves a palette path such as "environment.grass.1" to its hex colour. */
export function paletteColor(path: string): string {
  let node: unknown = palette;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`Unknown palette path "${path}"`);
    }
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'string') throw new Error(`Palette path "${path}" is not a colour`);
  return node;
}

/** Degenerate faces leave zero normals, which the hull shader would push to NaN. */
function repairHullNormals(geometry: BufferGeometry): void {
  const normals = geometry.getAttribute('normal');
  if (!normals) return;
  for (let index = 0; index < normals.count; index += 1) {
    const length = Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index));
    if (!(length > 1e-6)) normals.setXYZ(index, 0, 1, 0);
  }
}

export interface Scenery extends Group {
  /** Paper clouds, kept apart from the merged island so they can drift. */
  readonly clouds: readonly Group[];
  /** Creature shapes by name ("wing", "leaf"), vertex coloured, for the ambient layer to instance. */
  readonly creatures: ReadonlyMap<string, BufferGeometry>;
  /** Moves wind and clouds to presentation time (m1-liveliness.md 4). Reduced motion holds them still. */
  update(nowMs: number, reducedMotion: boolean): void;
  dispose(): void;
}

/** Clouds drift along +x and wrap inside this span (m1-liveliness.md 4.2). */
const CLOUD_SPEED = 0.15;
const CLOUD_SPAN = 20;
/** Grass tufts and flowers bend this many radians per unit of wind at their tip (m1-liveliness.md 4.1). */
const GRASS_BEND = 0.15;

interface WindUniforms {
  readonly windTime: { value: number };
  readonly windGust: { value: number };
  readonly windAmount: { value: number };
}

/** Adds the shared wind to a printed material: vertices bend along +x by their "_wind" weight. */
function addWind(material: MeshToonMaterial, uniforms: WindUniforms): void {
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float _wind;\nuniform float windTime;\nuniform float windGust;\nuniform float windAmount;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n'
        // Same wave as windAt() in motion/wind.ts; the gust is sampled at the island centre.
        + `float windNow = sin((windTime - transformed.x / ${WIND_SPEED.toFixed(2)}) / ${(WIND_PERIOD_MS / 1000).toFixed(2)}`
        + ' * 6.2831853) * (1.0 + windGust) * windAmount;\n'
        + `transformed.x += ${GRASS_BEND.toFixed(2)} * windNow * _wind * max(0.0, transformed.y - ${GROUND_SURFACE.y.toFixed(2)});`,
    );
  };
  material.customProgramCacheKey = () => 'seed-packet-toon-rim-wind-v1';
}

/**
 * Rebuilds an authored glTF scene with the shared printed materials (ADR 0009).
 * Material names are palette paths; meshes named "outline-<thousandths>" become ink hulls.
 * Nodes named "cloud-N" become drifting paper clouds.
 */
export function buildScenery(source: Object3D, materials: MaterialLibrary): Scenery {
  const root = new Group() as Scenery;
  root.name = 'scenery';
  const owned: { dispose(): void }[] = [];
  const color = new Color();
  const windUniforms: WindUniforms = { windTime: { value: 0 }, windGust: { value: 0 }, windAmount: { value: 0 } };
  source.updateMatrixWorld(true);

  const vertexColored = (object: Mesh, matrix: Matrix4): BufferGeometry => {
    const geometry = (object.geometry as BufferGeometry).clone().applyMatrix4(matrix);
    const name = Array.isArray(object.material) ? object.material[0]?.name : object.material.name;
    color.set(paletteColor(name ?? ''));
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) color.toArray(colors, index * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    // Wind weights come from Blender (tufts, flowers); anything without them stays still.
    if (!geometry.getAttribute('_wind')) geometry.setAttribute('_wind', new Float32BufferAttribute(new Float32Array(count), 1));
    return geometry;
  };
  const hullOf = (object: Mesh, matrix: Matrix4, thickness: number): Mesh => {
    const geometry = (object.geometry as BufferGeometry).clone().applyMatrix4(matrix);
    repairHullNormals(geometry);
    owned.push(geometry);
    const mesh = materials.outline(geometry, thickness);
    mesh.renderOrder = 0;
    return mesh;
  };
  const printedMesh = (geometries: BufferGeometry[], wind: boolean): Mesh => {
    const merged = mergeGeometries(geometries.map((geometry) => geometry.index ? geometry : geometry.toNonIndexed()));
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error('Scenery meshes have incompatible attributes');
    const base = materials.toon(new Color(1, 1, 1));
    const material = base.clone();
    material.onBeforeCompile = base.onBeforeCompile;
    material.customProgramCacheKey = base.customProgramCacheKey;
    material.vertexColors = true;
    if (wind) addWind(material, windUniforms);
    owned.push(merged, material);
    const mesh = new Mesh(merged, material);
    mesh.renderOrder = 1;
    return mesh;
  };

  const cloudRoots: Object3D[] = [];
  source.traverse((object) => {
    if (/^cloud-\d+$/.test(object.name)) cloudRoots.push(object);
  });
  const inCloud = (object: Object3D) => {
    for (let parent = object.parent; parent; parent = parent.parent) if (cloudRoots.includes(parent)) return true;
    return false;
  };

  // Creatures: "creature-wing", "creature-wing-dot", ... merge into one shape per second word.
  const creatureParts = new Map<string, BufferGeometry[]>();
  source.traverse((object) => {
    const match = /^creature-([a-z]+)/.exec(object.name);
    if (!match || !(object instanceof Mesh)) return;
    const parts = creatureParts.get(match[1]!) ?? [];
    parts.push(vertexColored(object, object.matrixWorld));
    creatureParts.set(match[1]!, parts);
  });
  const creatures = new Map<string, BufferGeometry>();
  for (const [name, parts] of creatureParts) {
    const merged = mergeGeometries(parts.map((geometry) => geometry.index ? geometry : geometry.toNonIndexed()));
    parts.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error(`Creature "${name}" meshes have incompatible attributes`);
    owned.push(merged);
    creatures.set(name, merged);
  }

  const printed: BufferGeometry[] = [];
  source.traverse((object) => {
    if (!(object instanceof Mesh) || inCloud(object) || object.name.startsWith('creature-')) return;
    // glTF strips dots from node names, so hull thickness is in thousandths: outline-60 = 0.06.
    const hull = /^outline-(\d+)$/.exec(object.name);
    if (hull) {
      const mesh = hullOf(object, object.matrixWorld, Number(hull[1]) / 1000);
      mesh.name = object.name;
      mesh.userData.role = 'scenery-outline';
      root.add(mesh);
      return;
    }
    printed.push(vertexColored(object, object.matrixWorld));
  });
  if (printed.length > 0) {
    // One printed mesh for the whole island keeps scenery to two draw calls with its hulls.
    const mesh = printedMesh(printed, true);
    mesh.name = 'scenery-printed';
    mesh.userData.role = 'scenery';
    root.add(mesh);
  }

  // Each cloud: lit and shade layers merged into one mesh plus its hull, in the cloud's own frame.
  const clouds: Group[] = [];
  let cloudMaterial: MeshBasicMaterial | null = null;
  for (const cloudRoot of cloudRoots) {
    const cloud = new Group();
    cloud.name = cloudRoot.name;
    cloud.userData.role = 'cloud';
    cloudRoot.matrixWorld.decompose(cloud.position, cloud.quaternion, cloud.scale);
    const inverse = cloudRoot.matrixWorld.clone().invert();
    const layers: BufferGeometry[] = [];
    cloudRoot.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const local = inverse.clone().multiply(object.matrixWorld);
      if (object.name.endsWith('-outline')) cloud.add(hullOf(object, local, 0.035 / cloud.scale.x));
      else layers.push(vertexColored(object, local));
    });
    if (layers.length > 0) {
      // Clouds are flat paper in the sky: unlit, so the key light never greys their face.
      const merged = mergeGeometries(layers);
      layers.forEach((geometry) => geometry.dispose());
      if (!merged) throw new Error('Cloud meshes have incompatible attributes');
      cloudMaterial ??= new MeshBasicMaterial({ vertexColors: true });
      owned.push(merged);
      const mesh = new Mesh(merged, cloudMaterial);
      mesh.renderOrder = 1;
      cloud.add(mesh);
    }
    cloud.userData.startX = cloud.position.x;
    clouds.push(cloud);
    root.add(cloud);
  }
  Object.assign(root, { clouds, creatures });

  root.update = (nowMs, reducedMotion) => {
    // Seconds within a whole number of wind periods, so float precision holds over long sessions.
    windUniforms.windTime.value = (nowMs % (WIND_PERIOD_MS * 100)) / 1000;
    windUniforms.windGust.value = gustAt(nowMs);
    windUniforms.windAmount.value = reducedMotion ? 0 : 1;
    if (reducedMotion) return;
    for (const cloud of clouds) {
      const x = (cloud.userData.startX as number) + CLOUD_SPEED * nowMs / 1000 + CLOUD_SPAN / 2;
      cloud.position.x = ((x % CLOUD_SPAN) + CLOUD_SPAN) % CLOUD_SPAN - CLOUD_SPAN / 2;
    }
  };
  root.dispose = () => {
    cloudMaterial?.dispose();
    for (const resource of owned.splice(0)) resource.dispose();
  };
  return root;
}

export async function loadScenery(url: string, materials: MaterialLibrary): Promise<Scenery> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scenery = buildScenery(gltf.scene, materials);
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) {
      (object.geometry as BufferGeometry).dispose();
      for (const material of [object.material].flat()) material.dispose();
    }
  });
  return scenery;
}

export const GARDEN_MODEL_URL = `${import.meta.env.BASE_URL}models/garden.glb`;
