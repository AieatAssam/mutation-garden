import { levelForXp, SPECIES, YIELD_SIZES } from '../content/species';
import { nextRandom } from '../state/rng';
import type { YieldSize } from '../state/types';
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

  if (species.unlockLevel > levelForXp(state.xp)) {
    return rejected(state, command, 'locked');
  }

  if (state.coins < species.seedCost) {
    return rejected(state, command, 'insufficient-coins');
  }

  const roll = nextRandom(state.rngState);
  const mutationRoll = nextRandom(state.mutationRngState);
  const plots = state.plots.slice();
  plots[plotIndex] = {
    ...plot,
    plant: { speciesId: species.id, plantedAt: effectiveNowMs, size: rollSize(roll.value), mutationSeed: mutationRoll.value === 0 ? 0 : Math.floor(mutationRoll.value * 0x1_0000_0000), waterCount: 0, ...(state.fertiliser > 0 ? { fertilised: true, boostMs: Math.round(species.growthDurationMs * 0.4) } : {}) },
  };

  const nextState: GardenState = {
    ...state,
    coins: state.coins - species.seedCost,
    rngState: roll.nextState,
    mutationRngState: mutationRoll.nextState,
    plantCount: state.plantCount + 1,
    fertiliser: Math.max(0, state.fertiliser - 1),
    plots,
  };
  const event: SimEvent = {
    type: 'Planted',
    plotId: plot.id,
    speciesId: species.id,
  };

  return { state: nextState, events: [event] };
}

function rollSize(value: number): YieldSize {
  let threshold = 0;
  for (const entry of YIELD_SIZES) {
    threshold += entry.chance;
    if (value < threshold) return entry.size;
  }
  return 'regular';
}

function rejected(
  state: GardenState,
  command: PlantCommand,
  reason: 'unknown-plot' | 'unknown-seed' | 'occupied' | 'insufficient-coins' | 'locked',
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
