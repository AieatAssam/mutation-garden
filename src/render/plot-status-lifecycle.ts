import { Quaternion, Vector3 } from 'three';
import type { ColorRepresentation } from 'three';
import type { GardenSnapshot, PlantSnapshot, PlotId, SpeciesId } from '../sim';
import { PLOT_STATUS_STAMP_DIAMETER, type PlotStatusDescriptor, type PlotStatusResources } from './plot-status';

export interface PlotStatusSpecies {
  readonly id: SpeciesId;
  readonly stageFractions: readonly [number, number, number];
  readonly fruitColor: ColorRepresentation;
}

export interface StampPickDescriptor {
  readonly plotId: PlotId;
  readonly center: Vector3;
  readonly visibleDiameter: number;
  /** Larger values are drawn later; ties in depth are broken by plot ID. */
  readonly drawOrder: number;
}

export interface PlotStatusLifecycleOptions {
  readonly resources: PlotStatusResources;
  readonly species: readonly PlotStatusSpecies[];
  /** Writes the bed-rim dial centre in world coordinates. */
  readonly getDialCenter: (plotId: PlotId, target: Vector3) => boolean;
  /** Writes the current plant top in world coordinates, excluding outlines and effects. */
  readonly getPlantTop: (plotId: PlotId, target: Vector3) => boolean;
}

export interface PlotStatusLifecycle {
  update(current: GardenSnapshot, previous: GardenSnapshot, alpha: number, cameraFacing?: Quaternion): void;
  /** Returns defensive copies; caller-owned vectors cannot mutate lifecycle state. */
  getStampPickDescriptors(): readonly StampPickDescriptor[];
}

interface PlantIdentity {
  readonly speciesId: SpeciesId;
  readonly plantedAt: number;
}

function identity(plant: PlantSnapshot): PlantIdentity {
  return { speciesId: plant.speciesId, plantedAt: plant.plantedAt };
}

function sameIdentity(a: PlantIdentity, b: PlantIdentity): boolean {
  return a.speciesId === b.speciesId && a.plantedAt === b.plantedAt;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function createPlotStatusLifecycle(options: PlotStatusLifecycleOptions): PlotStatusLifecycle {
  const speciesById = new Map(options.species.map((entry) => [entry.id, entry]));
  const identities = new Map<PlotId, PlantIdentity>();
  let pickDescriptors: readonly StampPickDescriptor[] = [];
  const top = new Vector3();
  const identityFacing = new Quaternion();

  function getStampPickDescriptors(): readonly StampPickDescriptor[] {
    return Object.freeze(pickDescriptors.map((entry) => Object.freeze({
      ...entry,
      center: entry.center.clone(),
    })));
  }

  return {
    update(current, previous, alpha, facing = identityFacing.identity()) {
      const interpolation = clamp01(alpha);
      const cameraFacing = facing.clone();
      const inverseFacing = cameraFacing.clone().invert();
      const previousById = new Map(previous.plots.map((plot) => [plot.id, plot.plant]));
      const livePlotIds = new Set(current.plots.map((plot) => plot.id));
      const descriptors: PlotStatusDescriptor[] = [];
      const stamps: StampPickDescriptor[] = [];

      for (const plot of current.plots) {
        const plant = plot.plant;
        if (!plant) {
          identities.delete(plot.id);
          continue;
        }

        const currentIdentity = identity(plant);
        const trackedIdentity = identities.get(plot.id);
        const replaced = Boolean(trackedIdentity && !sameIdentity(trackedIdentity, currentIdentity));
        identities.set(plot.id, currentIdentity);

        const species = speciesById.get(plant.speciesId);
        if (!species) throw new Error(`Missing plot status species descriptor for ${plant.speciesId}`);
        const priorPlant = previousById.get(plot.id) ?? null;
        const matchesPrevious = Boolean(priorPlant
          && priorPlant.speciesId === plant.speciesId
          && priorPlant.plantedAt === plant.plantedAt
          && !replaced);
        const progress = matchesPrevious
          ? priorPlant!.progress + (plant.progress - priorPlant!.progress) * interpolation
          : plant.progress;

        const dialCenter = new Vector3();
        const hasDial = options.getDialCenter(plot.id, dialCenter);
        const dial: PlotStatusDescriptor['dial'] = hasDial ? {
          center: dialCenter,
          progress: plant.stage === 'Harvestable' ? 1 : clamp01(progress),
          color: species.fruitColor,
          stageFractions: species.stageFractions,
          facing: cameraFacing,
        } : undefined;

        let stamp: PlotStatusDescriptor['stamp'];
        if (plant.stage === 'Harvestable' && options.getPlantTop(plot.id, top)) {
          const center = top.clone().add(new Vector3(0, 0.22, 0));
          stamp = { center, color: species.fruitColor, facing: cameraFacing };
          stamps.push({
            plotId: plot.id,
            center: center.clone(),
            visibleDiameter: PLOT_STATUS_STAMP_DIAMETER,
            drawOrder: 0,
          });
        }

        if (dial || stamp) descriptors.push({ plotId: plot.id, ...(dial ? { dial } : {}), ...(stamp ? { stamp } : {}) });
      }

      for (const plotId of identities.keys()) {
        if (!livePlotIds.has(plotId)) identities.delete(plotId);
      }

      const depth = (center: Vector3) => center.clone().applyQuaternion(inverseFacing).z;
      descriptors.sort((a, b) => depth(a.stamp?.center ?? a.dial!.center)
        - depth(b.stamp?.center ?? b.dial!.center) || a.plotId.localeCompare(b.plotId));
      const orderedStamps = stamps.sort((a, b) => depth(a.center) - depth(b.center)
        || a.plotId.localeCompare(b.plotId))
        .map((stamp, index) => Object.freeze({ ...stamp, drawOrder: index }));

      options.resources.update(descriptors);
      pickDescriptors = Object.freeze(orderedStamps.map((stamp) => Object.freeze({
        ...stamp,
        center: stamp.center.clone(),
      })));
    },
    getStampPickDescriptors,
  };
}
