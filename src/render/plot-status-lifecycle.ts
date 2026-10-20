import { Quaternion, Vector3 } from 'three';
import type { ColorRepresentation } from 'three';
import type { GardenSnapshot, PlantSnapshot, PlotId, SpeciesId } from '../sim';
import { PLOT_STATUS_STAMP_DIAMETER, type PlotStatusDescriptor, type PlotStatusResources } from './plot-status';

const DIAL_POP_MS = 160;
const STAMP_POP_MS = 220;
const REDUCED_STAMP_FADE_MS = 120;
const HARVEST_STAMP_FADE_MS = 120;

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
  /** Presentation time is an injected monotonic clock; reduced motion never changes eligibility. */
  update(
    current: GardenSnapshot,
    previous: GardenSnapshot,
    alpha: number,
    cameraFacing?: Quaternion,
    presentationTimeMs?: number,
    reducedMotion?: boolean,
  ): void;
  /** Returns defensive copies; fading harvested stamps stop accepting input immediately. */
  getStampPickDescriptors(): readonly StampPickDescriptor[];
}

interface PlantIdentity {
  readonly speciesId: SpeciesId;
  readonly plantedAt: number;
}

interface TrackedPlant {
  readonly identity: PlantIdentity;
  readonly plant: PlantSnapshot;
}

interface ReadyPresentation {
  readonly identity: PlantIdentity;
  readonly readyAtMs: number;
  readonly reducedMotionAtStart: boolean;
  popEnabled: boolean;
}

interface PresentedStamp {
  readonly center: Vector3;
  readonly color: ColorRepresentation;
  readonly scale: number;
  readonly opacity: number;
}

interface FadingStamp extends PresentedStamp {
  readonly startedAtMs: number;
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

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/** Smooth spring-shaped swell and settle, without an abrupt velocity change at either end. */
function popScale(elapsedMs: number, durationMs: number, peakAt: number, startScale = 0): number {
  const progress = clamp01(elapsedMs / durationMs);
  if (progress >= 1) return 1;
  if (progress < peakAt) return startScale + (1.15 - startScale) * smoothstep(progress / peakAt);
  return 1.15 - 0.15 * smoothstep((progress - peakAt) / (1 - peakAt));
}

export function createPlotStatusLifecycle(options: PlotStatusLifecycleOptions): PlotStatusLifecycle {
  const speciesById = new Map(options.species.map((entry) => [entry.id, entry]));
  const trackedPlants = new Map<PlotId, TrackedPlant>();
  const ready = new Map<PlotId, ReadyPresentation>();
  const lastStampPresentation = new Map<PlotId, PresentedStamp>();
  const fading = new Map<PlotId, FadingStamp>();
  let pickDescriptors: readonly StampPickDescriptor[] = [];
  const top = new Vector3();
  const defaultFacing = new Quaternion();

  function clearPlantState(plotId: PlotId): void {
    trackedPlants.delete(plotId);
    ready.delete(plotId);
    lastStampPresentation.delete(plotId);
  }

  function getStampPickDescriptors(): readonly StampPickDescriptor[] {
    return Object.freeze(pickDescriptors.map((entry) => Object.freeze({
      ...entry,
      center: entry.center.clone(),
    })));
  }

  return {
    update(current, previous, alpha, facing = defaultFacing, presentationTimeMs = current.nowMs, reducedMotion = false) {
      if (!Number.isFinite(presentationTimeMs)) throw new RangeError('presentationTimeMs must be finite');
      const interpolation = clamp01(alpha);
      const cameraFacing = facing.clone();
      const inverseFacing = cameraFacing.clone().invert();
      const previousById = new Map(previous.plots.map((plot) => [plot.id, plot.plant]));
      const livePlotIds = new Set(current.plots.map((plot) => plot.id));
      const descriptors: PlotStatusDescriptor[] = [];
      const stamps: StampPickDescriptor[] = [];

      for (const plot of current.plots) {
        const plant = plot.plant;
        const priorPlant = previousById.get(plot.id) ?? null;
        const tracked = trackedPlants.get(plot.id);
        const plantIdentity = plant ? identity(plant) : null;
        const replaced = Boolean(plantIdentity && tracked && !sameIdentity(plantIdentity, tracked.identity));

        if (replaced) {
          ready.delete(plot.id);
          lastStampPresentation.delete(plot.id);
          fading.delete(plot.id);
        }

        if (!plant) {
          let fade = fading.get(plot.id);
          if (!fade && tracked?.plant.stage === 'Harvestable') {
            const presented = lastStampPresentation.get(plot.id);
            if (presented) {
              fade = { ...presented, center: presented.center.clone(), startedAtMs: presentationTimeMs };
              fading.set(plot.id, fade);
            }
          }
          if (fade) {
            const elapsed = Math.max(0, presentationTimeMs - fade.startedAtMs);
            if (elapsed < HARVEST_STAMP_FADE_MS) {
              descriptors.push({
                plotId: plot.id,
                stamp: {
                  center: fade.center,
                  color: fade.color,
                  scale: fade.scale,
                  opacity: fade.opacity * (1 - clamp01(elapsed / HARVEST_STAMP_FADE_MS)),
                  facing: cameraFacing,
                },
              });
            } else fading.delete(plot.id);
          }
          clearPlantState(plot.id);
          continue;
        }

        const species = speciesById.get(plant.speciesId);
        if (!species) throw new Error(`Missing plot status species descriptor for ${plant.speciesId}`);
        const currentIdentity = plantIdentity!;
        const matchingPrevious = Boolean(priorPlant
          && priorPlant.speciesId === plant.speciesId
          && priorPlant.plantedAt === plant.plantedAt
          && !replaced);
        const progress = matchingPrevious
          ? priorPlant!.progress + (plant.progress - priorPlant!.progress) * interpolation
          : plant.progress;

        let dial: PlotStatusDescriptor['dial'];
        let dialScale = 1;
        let stamp: PlotStatusDescriptor['stamp'];
        const dialCenter = new Vector3();
        if (options.getDialCenter(plot.id, dialCenter)) {
          if (plant.stage === 'Harvestable') {
            const readyPresentation = ready.get(plot.id);
            let presentation = readyPresentation;
            if (!presentation || !sameIdentity(presentation.identity, currentIdentity)) {
              const wasAlreadyReady = tracked && sameIdentity(tracked.identity, currentIdentity)
                ? tracked.plant.stage === 'Harvestable'
                : Boolean(matchingPrevious && priorPlant!.stage === 'Harvestable');
              presentation = {
                identity: currentIdentity,
                readyAtMs: wasAlreadyReady ? Number.NEGATIVE_INFINITY : presentationTimeMs,
                reducedMotionAtStart: reducedMotion,
                popEnabled: !wasAlreadyReady && !reducedMotion,
              };
              ready.set(plot.id, presentation);
            }
            if (reducedMotion) presentation.popEnabled = false;
            if (presentation.popEnabled && !reducedMotion) {
              dialScale = popScale(Math.max(0, presentationTimeMs - presentation.readyAtMs), DIAL_POP_MS, 0.45, 1);
            }
          }
          dial = {
            center: dialCenter,
            progress: plant.stage === 'Harvestable' ? 1 : clamp01(progress),
            color: species.fruitColor,
            stageFractions: species.stageFractions,
            facing: cameraFacing,
          };
        }

        if (plant.stage === 'Harvestable') {
          let presentation = ready.get(plot.id);
          if (!presentation || !sameIdentity(presentation.identity, currentIdentity)) {
            const wasAlreadyReady = tracked && sameIdentity(tracked.identity, currentIdentity)
              ? tracked.plant.stage === 'Harvestable'
              : Boolean(matchingPrevious && priorPlant!.stage === 'Harvestable');
            presentation = {
              identity: currentIdentity,
              readyAtMs: wasAlreadyReady ? Number.NEGATIVE_INFINITY : presentationTimeMs,
              reducedMotionAtStart: reducedMotion,
              popEnabled: !wasAlreadyReady && !reducedMotion,
            };
            ready.set(plot.id, presentation);
          }
          if (reducedMotion) presentation.popEnabled = false;
          if (options.getPlantTop(plot.id, top)) {
            const center = top.clone().add(new Vector3(0, 0.22, 0));
            const elapsed = Number.isFinite(presentation.readyAtMs)
              ? Math.max(0, presentationTimeMs - presentation.readyAtMs)
              : STAMP_POP_MS;
            const scale = presentation.popEnabled && !reducedMotion
              ? popScale(elapsed, STAMP_POP_MS, 0.58)
              : 1;
            const opacity = presentation.reducedMotionAtStart
              ? clamp01(elapsed / REDUCED_STAMP_FADE_MS)
              : 1;
            stamp = { center, color: species.fruitColor, scale, opacity, facing: cameraFacing };
            lastStampPresentation.set(plot.id, { center: center.clone(), color: species.fruitColor, scale, opacity });
            stamps.push({
              plotId: plot.id,
              center: center.clone(),
              // Eligibility remains stable while the visual stamp animates into place.
              visibleDiameter: PLOT_STATUS_STAMP_DIAMETER,
              drawOrder: 0,
            });
          }
          fading.delete(plot.id);
        } else {
          ready.delete(plot.id);
          fading.delete(plot.id);
          lastStampPresentation.delete(plot.id);
        }

        if (dial || stamp) descriptors.push({ plotId: plot.id, ...(dial ? { dial, dialScale } : {}), ...(stamp ? { stamp } : {}) });
        trackedPlants.set(plot.id, { identity: currentIdentity, plant });
      }

      const trackedAndFadingPlotIds = new Set([...trackedPlants.keys(), ...fading.keys()]);
      for (const plotId of trackedAndFadingPlotIds) {
        if (livePlotIds.has(plotId)) continue;
        clearPlantState(plotId);
        fading.delete(plotId);
      }

      const depth = (center: Vector3) => center.clone().applyQuaternion(inverseFacing).z;
      descriptors.sort((a, b) => depth(a.stamp?.center ?? a.dial!.center)
        - depth(b.stamp?.center ?? b.dial!.center) || a.plotId.localeCompare(b.plotId));
      const orderedStamps = stamps.sort((a, b) => depth(a.center) - depth(b.center)
        || a.plotId.localeCompare(b.plotId))
        .map((stampDescriptor, index) => Object.freeze({ ...stampDescriptor, drawOrder: index }));

      options.resources.update(descriptors);
      pickDescriptors = Object.freeze(orderedStamps.map((stampDescriptor) => Object.freeze({
        ...stampDescriptor,
        center: stampDescriptor.center.clone(),
      })));
    },
    getStampPickDescriptors,
  };
}
