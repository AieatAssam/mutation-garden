import { SPECIES } from '../content/species';
import { getGrowthView } from './growth';
import type { Command, GardenState, SimEvent, StepResult } from '../state/types';

type HarvestCommand = Extract<Command, { readonly type: 'Harvest' }>;

/** Harvest each distinct target once, preserving the order in the command. */
export function harvest(
  state: GardenState,
  command: HarvestCommand,
  effectiveNowMs: number,
): StepResult {
  let nextState = state;
  let totalCoins = 0;
  let count = 0;
  const events: SimEvent[] = [];
  const seenPlotIds = new Set<string>();

  for (const plotId of command.plotIds) {
    if (seenPlotIds.has(plotId)) continue;
    seenPlotIds.add(plotId);

    const plotIndex = nextState.plots.findIndex((candidate) => candidate.id === plotId);
    const plot = nextState.plots[plotIndex];
    if (plotIndex < 0 || plot === undefined) {
      events.push(rejection(plotId, 'unknown-plot'));
      continue;
    }

    if (plot.plant === null) {
      events.push(rejection(plotId, 'empty'));
      continue;
    }

    if (getGrowthView(plot.plant.speciesId, plot.plant.plantedAt, effectiveNowMs).stage !== 'Harvestable') {
      events.push(rejection(plotId, 'not-harvestable'));
      continue;
    }

    const species = SPECIES.find((entry) => entry.id === plot.plant?.speciesId);
    if (!species) {
      events.push(rejection(plotId, 'not-harvestable'));
      continue;
    }

    const plots = nextState.plots.slice();
    plots[plotIndex] = { ...plot, plant: null };
    nextState = {
      ...nextState,
      coins: nextState.coins + species.baseValue,
      plots,
    };
    totalCoins += species.baseValue;
    count += 1;
    events.push({
      type: 'Harvested',
      plotId,
      speciesId: species.id,
      coins: species.baseValue,
    });
  }

  if (count > 0) events.push({ type: 'HarvestCompleted', count, coins: totalCoins });
  return { state: nextState, events };
}

function rejection(
  plotId: string,
  reason: 'unknown-plot' | 'empty' | 'not-harvestable',
): SimEvent {
  return { type: 'CommandRejected', command: 'Harvest', plotId, reason };
}
