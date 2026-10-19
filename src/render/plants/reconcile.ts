import type { GardenSnapshot, PlantSnapshot, PlotId } from '../../sim';
import type { Group } from 'three';
import type { MaterialLibrary } from '../materials';
import { createBubbleBerry } from './bubble-berry';
import { createTwistroot } from './twistroot';
import { createSunnySprout, type PlantRig } from './sunny-sprout';

interface Entry { readonly speciesId: PlantSnapshot['speciesId']; readonly plantedAt: number; readonly rig: PlantRig }
export interface PlantReconciler {
  update(previous: GardenSnapshot, current: GardenSnapshot, alpha: number, reducedMotion: boolean): void;
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
            ? createSunnySprout(materials, phase(plot.id))
            : plant.speciesId === 'bubble-berry'
              ? createBubbleBerry(materials, phase(plot.id))
              : createTwistroot(materials, phase(plot.id));
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
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const plotId of [...entries.keys()]) remove(plotId);
    },
  };
}
