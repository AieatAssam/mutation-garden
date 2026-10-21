import type { GardenSnapshot, PlantSnapshot, PlotId } from '../../sim';
import { Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { MaterialLibrary } from '../materials';
import { palette } from '../palette';
import { createBubbleBerry } from './bubble-berry';
import { createTwistroot } from './twistroot';
import { createSunnySprout, type PlantRig } from './sunny-sprout';

interface Entry {
  readonly speciesId: PlantSnapshot['speciesId'];
  readonly plantedAt: number;
  readonly rig: PlantRig;
  readonly stageFade: Mesh;
  readonly stageFadeMaterial: MeshBasicMaterial;
  stageStartedAt: number | null;
  reducedStageMotion: boolean;
}
const STAGE_POP_MS = 160;
const REDUCED_STAGE_FADE_MS = 120;
export interface PlantReconciler {
  update(previous: GardenSnapshot, current: GardenSnapshot, alpha: number, reducedMotion: boolean): void;
  flickLeaves(plotId: PlotId, presentationNowMs: number, reducedMotion: boolean): void;
  stageAccent(plotId: PlotId, presentationNowMs: number, reducedMotion: boolean): void;
  dispose(): void;
}

function phase(plotId: PlotId): number {
  let hash = 0;
  for (const character of plotId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 3000;
}

export function createPlantReconciler(plots: readonly (Group & { readonly plotId?: PlotId })[], materials: MaterialLibrary): PlantReconciler {
  const anchors = new Map(plots.filter((plot): plot is Group & { readonly plotId: PlotId } => Boolean(plot.plotId)).map((plot) => [plot.plotId, plot]));
  const entries = new Map<PlotId, Entry>();
  let disposed = false;
  const remove = (plotId: PlotId) => {
    const entry = entries.get(plotId);
    if (!entry) return;
    entry.rig.root.removeFromParent();
    entry.stageFade.removeFromParent();
    entry.stageFade.geometry.dispose();
    entry.stageFadeMaterial.dispose();
    entry.rig.dispose();
    entries.delete(plotId);
  };
  return {
    flickLeaves(plotId, presentationNowMs, reducedMotion) {
      if (disposed) return;
      entries.get(plotId)?.rig.flickLeaves(presentationNowMs, reducedMotion);
    },
    stageAccent(plotId, presentationNowMs, reducedMotion) {
      if (disposed || !Number.isFinite(presentationNowMs)) return;
      const entry = entries.get(plotId);
      if (!entry) return;
      entry.stageStartedAt = presentationNowMs;
      entry.reducedStageMotion = reducedMotion;
      entry.stageFade.visible = reducedMotion;
      entry.stageFadeMaterial.opacity = reducedMotion ? 0.55 : 0;
    },
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
            ? createSunnySprout(materials, phase(plot.id))
            : plant.speciesId === 'bubble-berry'
              ? createBubbleBerry(materials, phase(plot.id))
              : createTwistroot(materials, phase(plot.id));
          const stageFadeGeometry = new RingGeometry(0.25, 0.32, 20);
          const stageFadeMaterial = new MeshBasicMaterial({
            color: palette.environment.grass[0],
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          const stageFade = new Mesh(stageFadeGeometry, stageFadeMaterial);
          stageFade.name = 'stage-motion-fade';
          stageFade.userData.role = 'stage-motion-fade';
          stageFade.position.y = 0.025;
          stageFade.rotation.x = -Math.PI / 2;
          stageFade.renderOrder = 4;
          stageFade.visible = false;
          rig.root.add(stageFade);
          entry = {
            speciesId: plant.speciesId,
            plantedAt: plant.plantedAt,
            rig,
            stageFade,
            stageFadeMaterial,
            stageStartedAt: null,
            reducedStageMotion: false,
          };
          entries.set(plot.id, entry);
          anchors.get(plot.id)!.add(entry.rig.root);
        }
        const before = oldPlots.get(plot.id);
        const progress = before?.speciesId === plant.speciesId && before.plantedAt === plant.plantedAt
          ? before.progress + (plant.progress - before.progress) * blend : plant.progress;
        entry.rig.update({ ...plant, progress }, now, reducedMotion);
        if (entry.stageStartedAt !== null && entry.reducedStageMotion !== reducedMotion) {
          entry.reducedStageMotion = reducedMotion;
          entry.stageStartedAt = now;
          entry.stageFade.visible = reducedMotion;
          entry.stageFadeMaterial.opacity = reducedMotion ? 0.55 : 0;
        }
        if (entry.stageStartedAt !== null) {
          const durationMs = entry.reducedStageMotion ? REDUCED_STAGE_FADE_MS : STAGE_POP_MS;
          const progress = Math.max(0, Math.min(1, (now - entry.stageStartedAt) / durationMs));
          const baseScale = entry.rig.root.scale.clone();
          if (entry.reducedStageMotion) {
            entry.rig.root.scale.copy(baseScale);
            entry.stageFadeMaterial.opacity = 0.55 * (1 - progress);
          } else {
            const scale = 1 + 0.08 * (1 - progress);
            entry.rig.root.scale.copy(baseScale).multiplyScalar(scale);
          }
          if (progress >= 1) {
            entry.stageStartedAt = null;
            entry.rig.root.scale.copy(baseScale);
            entry.stageFade.visible = false;
            entry.stageFadeMaterial.opacity = 0;
          }
        }
      }
      for (const plotId of entries.keys()) if (!seen.has(plotId)) remove(plotId);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const plotId of [...entries.keys()]) remove(plotId);
    },
  };
}
