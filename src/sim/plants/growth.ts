import { SPECIES } from '../content/species';
import { growthStart, type GardenState, type SimEvent, type GrowthView, type SpeciesId } from '../state/types';

/** Derive a plant's current growth view from its planting timestamp. */
export function getGrowthView(
  speciesId: SpeciesId,
  growthStartMs: number,
  nowMs: number,
): GrowthView {
  const species = SPECIES.find((entry) => entry.id === speciesId);
  if (!species) throw new RangeError(`Unknown species: ${String(speciesId)}`);

  const elapsedMs = Math.max(0, nowMs - growthStartMs);
  const progress = Math.min(1, elapsedMs / species.growthDurationMs);
  let stage: GrowthView['stage'] = 'Seed';

  for (const definition of species.stages) {
    if (elapsedMs < definition.startsAtMs) break;
    stage = definition.stage;
  }

  return { stage, progress };
}

/** Return all growth events crossed by existing plants in stable plot/stage order. */
export function collectGrowthEvents(
  state: GardenState,
  fromMs: number,
  toMs: number,
): readonly SimEvent[] {
  if (toMs <= fromMs) return [];

  const events: SimEvent[] = [];
  for (const plot of state.plots) {
    const plant = plot.plant;
    if (!plant) continue;

    const species = SPECIES.find((entry) => entry.id === plant.speciesId);
    if (!species) continue;

    for (const definition of species.stages) {
      if (definition.stage === 'Seed') continue;
      const boundaryMs = growthStart(plant) + definition.startsAtMs;
      if (boundaryMs <= fromMs || boundaryMs > toMs) continue;

      if (definition.stage === 'Harvestable') {
        events.push({ type: 'Harvestable', plotId: plot.id });
      } else {
        events.push({ type: 'StageReached', plotId: plot.id, stage: definition.stage });
      }
    }
  }

  return events;
}
