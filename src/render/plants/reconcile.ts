import type { GardenSnapshot, PlantSnapshot, PlotId } from '../../sim';
import { Box3, InstancedMesh, Matrix4, Vector3, type Group, type Mesh, type Object3D } from 'three';
import type { MaterialLibrary } from '../materials';
import { createBubbleBerry } from './bubble-berry';
import { createTwistroot } from './twistroot';
import { createSunnySprout, type PlantRig } from './sunny-sprout';

interface Entry { readonly speciesId: PlantSnapshot['speciesId']; readonly plantedAt: number; readonly rig: PlantRig }
export interface PlantReconciler {
  update(previous: GardenSnapshot, current: GardenSnapshot, alpha: number, reducedMotion: boolean): void;
  /** Writes the highest visible semantic plant surface in world space. */
  getTop(plotId: PlotId, target: Vector3): boolean;
  dispose(): void;
}

const semanticBounds = new Box3();
const semanticTop = new Vector3();
const semanticWorldMatrix = new Matrix4();

function visibleThroughParents(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function getSemanticTop(root: Group, target: Vector3): boolean {
  root.updateWorldMatrix(true, true);
  let found = false;
  let highestY = -Infinity;
  root.traverse((object) => {
    const mesh = object as Mesh;
    const part = mesh.userData.part;
    if (!mesh.isMesh || typeof part !== 'string' || part === 'halo' || part === 'ripe-halo' || part === 'blob'
      || part.endsWith('-outline')
      || !visibleThroughParents(mesh) || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    const instanceCount = mesh instanceof InstancedMesh ? mesh.count : 1;
    for (let index = 0; index < instanceCount; index += 1) {
      if (mesh instanceof InstancedMesh) {
        mesh.getMatrixAt(index, semanticWorldMatrix);
        semanticWorldMatrix.premultiply(mesh.matrixWorld);
      } else semanticWorldMatrix.copy(mesh.matrixWorld);
      semanticBounds.copy(mesh.geometry.boundingBox).applyMatrix4(semanticWorldMatrix);
      if (!Number.isFinite(semanticBounds.max.y) || semanticBounds.max.y <= highestY) continue;
      highestY = semanticBounds.max.y;
      semanticTop.set(
        (semanticBounds.min.x + semanticBounds.max.x) * 0.5,
        semanticBounds.max.y,
        (semanticBounds.min.z + semanticBounds.max.z) * 0.5,
      );
      found = true;
    }
  });
  if (!found) return false;
  target.copy(semanticTop);
  return true;
}

function phase(plotId: PlotId): number {
  let hash = 0;
  for (const character of plotId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 3000;
}

export function createPlantReconciler(plots: readonly (Group & { readonly plotId?: PlotId })[], materials: MaterialLibrary): PlantReconciler {
  const anchors = new Map(plots.filter((plot): plot is Group & { readonly plotId: PlotId } => Boolean(plot.plotId)).map((plot) => [plot.plotId, plot]));
  const hopPhaseOffsets = new Map(plots.flatMap((plot, index) => plot.plotId ? [[plot.plotId, index * 500] as const] : []));
  const entries = new Map<PlotId, Entry>();
  let disposed = false;
  let currentPlants = new Set<PlotId>();
  const remove = (plotId: PlotId) => {
    const entry = entries.get(plotId);
    if (!entry) return;
    entry.rig.root.removeFromParent();
    entry.rig.dispose();
    entries.delete(plotId);
  };
  return {
    update(previous, current, alpha, reducedMotion) {
      if (disposed) return;
      const blend = Math.min(1, Math.max(0, alpha));
      const now = previous.nowMs + (current.nowMs - previous.nowMs) * blend;
      const oldPlots = new Map(previous.plots.map((plot) => [plot.id, plot.plant]));
      const seen = new Set<PlotId>();
      for (const plot of current.plots) {
        seen.add(plot.id);
        const plant = plot.plant;
        if (!plant || (plant.speciesId !== 'sunny-sprout' && plant.speciesId !== 'bubble-berry' && plant.speciesId !== 'twistroot') || !anchors.has(plot.id)) { remove(plot.id); continue; }
        let entry = entries.get(plot.id);
        if (entry && (entry.speciesId !== plant.speciesId || entry.plantedAt !== plant.plantedAt)) { remove(plot.id); entry = undefined; }
        if (!entry) {
          const rig = plant.speciesId === 'sunny-sprout'
            ? createSunnySprout(materials, phase(plot.id), hopPhaseOffsets.get(plot.id) ?? 0)
            : plant.speciesId === 'bubble-berry'
              ? createBubbleBerry(materials, phase(plot.id), hopPhaseOffsets.get(plot.id) ?? 0)
              : createTwistroot(materials, phase(plot.id), hopPhaseOffsets.get(plot.id) ?? 0);
          entry = { speciesId: plant.speciesId, plantedAt: plant.plantedAt, rig };
          entries.set(plot.id, entry);
          anchors.get(plot.id)!.add(entry.rig.root);
        }
        const before = oldPlots.get(plot.id);
        const progress = before?.speciesId === plant.speciesId && before.plantedAt === plant.plantedAt
          ? before.progress + (plant.progress - before.progress) * blend : plant.progress;
        entry.rig.update({ ...plant, progress }, now, reducedMotion);
      }
      for (const plotId of entries.keys()) if (!seen.has(plotId)) remove(plotId);
      currentPlants = new Set([...entries.keys()]);
    },
    getTop(plotId, target) {
      if (disposed || !currentPlants.has(plotId)) return false;
      const entry = entries.get(plotId);
      if (!entry) return false;
      return getSemanticTop(entry.rig.root, target);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      currentPlants.clear();
      for (const plotId of [...entries.keys()]) remove(plotId);
    },
  };
}
