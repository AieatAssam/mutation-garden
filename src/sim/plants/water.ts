import { SPECIES, WATER_SPEEDUP } from '../content/species';
import { getGrowthView } from './growth';
import type { Command, GardenState, SimEvent, StepResult } from '../state/types';

type WaterCommand = Extract<Command, { readonly type: 'Water' }>;

/**
 * Water a growing plant once: its remaining growth time shrinks by WATER_SPEEDUP.
 * Growth stays timestamp-derived by moving plantedAt earlier; stages crossed by the jump emit now.
 */
export function water(state: GardenState, command: WaterCommand, effectiveNowMs: number): StepResult {
  const plotIndex = state.plots.findIndex((plot) => plot.id === command.plotId);
  const plot = state.plots[plotIndex];
  if (plotIndex < 0 || plot === undefined) return rejected(state, command, 'unknown-plot');
  const plantState = plot.plant;
  if (plantState === null) return rejected(state, command, 'empty');
  if (plantState.watered) return rejected(state, command, 'already-watered');
  const species = SPECIES.find((entry) => entry.id === plantState.speciesId)!;
  const before = getGrowthView(plantState.speciesId, plantState.plantedAt, effectiveNowMs);
  if (before.stage === 'Harvestable') return rejected(state, command, 'not-growing');

  const remainingMs = plantState.plantedAt + species.growthDurationMs - effectiveNowMs;
  const plantedAt = plantState.plantedAt - Math.round(remainingMs * WATER_SPEEDUP);
  const plots = state.plots.slice();
  plots[plotIndex] = { ...plot, plant: { ...plantState, plantedAt, watered: true } };

  const events: SimEvent[] = [{ type: 'Watered', plotId: plot.id }];
  const elapsedBefore = effectiveNowMs - plantState.plantedAt;
  const elapsedAfter = effectiveNowMs - plantedAt;
  for (const definition of species.stages) {
    if (definition.stage === 'Seed' || definition.startsAtMs <= elapsedBefore || definition.startsAtMs > elapsedAfter) continue;
    events.push(definition.stage === 'Harvestable'
      ? { type: 'Harvestable', plotId: plot.id }
      : { type: 'StageReached', plotId: plot.id, stage: definition.stage });
  }
  return { state: { ...state, plots }, events };
}

function rejected(
  state: GardenState,
  command: WaterCommand,
  reason: 'unknown-plot' | 'empty' | 'already-watered' | 'not-growing',
): StepResult {
  return { state, events: [{ type: 'CommandRejected', command: command.type, plotId: command.plotId, reason }] };
}
