import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MaterialLibrary } from './materials';
import { palette } from './palette';

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
  dispose(): void;
}

/**
 * Rebuilds an authored glTF scene with the shared printed materials (ADR 0009).
 * Material names are palette paths; meshes named "outline-<thousandths>" become ink hulls.
 */
export function buildScenery(source: Object3D, materials: MaterialLibrary): Scenery {
  const root = new Group() as Scenery;
  root.name = 'scenery';
  const owned: { dispose(): void }[] = [];
  const printed: BufferGeometry[] = [];
  const color = new Color();
  source.updateMatrixWorld(true);
  source.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = (object.geometry as BufferGeometry).clone().applyMatrix4(object.matrixWorld);
    // glTF strips dots from node names, so hull thickness is in thousandths: outline-60 = 0.06.
    const hull = /^outline-(\d+)$/.exec(object.name);
    if (hull) {
      repairHullNormals(geometry);
      owned.push(geometry);
      const mesh = materials.outline(geometry, Number(hull[1]) / 1000);
      mesh.name = object.name;
      mesh.userData.role = 'scenery-outline';
      mesh.renderOrder = 0;
      root.add(mesh);
      return;
    }
    const name = Array.isArray(object.material) ? object.material[0]?.name : object.material.name;
    color.set(paletteColor(name ?? ''));
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) color.toArray(colors, index * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    printed.push(geometry);
  });
  if (printed.length > 0) {
    // One printed mesh for the whole island keeps scenery to two draw calls with its hulls.
    const merged = mergeGeometries(printed.map((geometry) => geometry.index ? geometry : geometry.toNonIndexed()));
    printed.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error('Scenery meshes have incompatible attributes');
    const base = materials.toon(new Color(1, 1, 1));
    const material = base.clone();
    material.onBeforeCompile = base.onBeforeCompile;
    material.customProgramCacheKey = base.customProgramCacheKey;
    material.vertexColors = true;
    owned.push(merged, material);
    const mesh = new Mesh(merged, material);
    mesh.name = 'scenery-printed';
    mesh.userData.role = 'scenery';
    mesh.renderOrder = 1;
    root.add(mesh);
  }
  root.dispose = () => {
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
