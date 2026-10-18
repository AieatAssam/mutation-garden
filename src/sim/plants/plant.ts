import { SPECIES } from '../content/species';
import type { Command, GardenState, SimEvent, StepResult } from '../state/types';

type PlantCommand = Extract<Command, { readonly type: 'Plant' }>;

/** Apply one planting intent against the current state. */
export function plant(
  state: GardenState,
  command: PlantCommand,
  effectiveNowMs: number,
): StepResult {
  const plotIndex = state.plots.findIndex((plot) => plot.id === command.plotId);
  const plot = state.plots[plotIndex];
  if (plotIndex < 0 || plot === undefined) {
    return rejected(state, command, 'unknown-plot');
  }

  const species = SPECIES.find((entry) => entry.id === command.seedId);
  if (!species) {
    return rejected(state, command, 'unknown-seed');
  }

  if (plot.plant !== null) {
    return rejected(state, command, 'occupied');
  }

  if (state.coins < species.seedCost) {
    return rejected(state, command, 'insufficient-coins');
  }

  const plots = state.plots.slice();
  plots[plotIndex] = {
    ...plot,
    plant: { speciesId: species.id, plantedAt: effectiveNowMs },
  };

  const nextState: GardenState = {
    ...state,
    coins: state.coins - species.seedCost,
    plots,
  };
  const event: SimEvent = {
    type: 'Planted',
    plotId: plot.id,
    speciesId: species.id,
  };

  return { state: nextState, events: [event] };
}

function rejected(
  state: GardenState,
  command: PlantCommand,
  reason: 'unknown-plot' | 'unknown-seed' | 'occupied' | 'insufficient-coins',
): StepResult {
  return {
    state,
    events: [{
      type: 'CommandRejected',
      command: command.type,
      plotId: command.plotId,
      reason,
    }],
  };
}
