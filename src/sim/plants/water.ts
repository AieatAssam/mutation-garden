import { SPECIES, WATER_SPEEDUP } from '../content/species';
import { getGrowthView } from './growth';
import { growthStart, type Command, type GardenState, type SimEvent, type StepResult } from '../state/types';

type WaterCommand = Extract<Command, { readonly type: 'Water' }>;

/**
 * Water a growing plant once: its remaining growth time shrinks by WATER_SPEEDUP.
 * Growth stays timestamp-derived through boostMs; stages crossed by the jump emit now.
 */
export function water(state: GardenState, command: WaterCommand, effectiveNowMs: number): StepResult {
  const plotIndex = state.plots.findIndex((plot) => plot.id === command.plotId);
  const plot = state.plots[plotIndex];
  if (plotIndex < 0 || plot === undefined) return rejected(state, command, 'unknown-plot');
  const plantState = plot.plant;
  if (plantState === null) return rejected(state, command, 'empty');
  if (plantState.boostMs !== undefined) return rejected(state, command, 'already-watered');
  const species = SPECIES.find((entry) => entry.id === plantState.speciesId)!;
  const start = growthStart(plantState);
  const before = getGrowthView(plantState.speciesId, start, effectiveNowMs);
  if (before.stage === 'Harvestable') return rejected(state, command, 'not-growing');
  // A seed can't be watered yet, so a quick double tap after planting does nothing (design.md 4.2).
  if (before.stage === 'Seed') return rejected(state, command, 'too-early');

  const remainingMs = start + species.growthDurationMs - effectiveNowMs;
  const boostMs = Math.round(remainingMs * WATER_SPEEDUP);
  const plots = state.plots.slice();
  plots[plotIndex] = { ...plot, plant: { ...plantState, boostMs } };

  const events: SimEvent[] = [{ type: 'Watered', plotId: plot.id }];
  const elapsedBefore = effectiveNowMs - start;
  const elapsedAfter = elapsedBefore + boostMs;
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
  reason: 'unknown-plot' | 'empty' | 'already-watered' | 'not-growing' | 'too-early',
): StepResult {
  return { state, events: [{ type: 'CommandRejected', command: command.type, plotId: command.plotId, reason }] };
}
