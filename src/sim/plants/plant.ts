import { levelForXp, SPECIES, YIELD_SIZES } from '../content/species';
import { areAdjacent } from './mutate';
import { getGrowthView } from './growth';
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

  const labSeed = species.id === 'prism-fig' || species.id === 'sunburst';
  const labSeedIndex = labSeed ? state.labSeeds.indexOf(species.id) : -1;
  if (labSeed ? labSeedIndex < 0 : species.unlockLevel > levelForXp(state.xp)) return rejected(state, command, 'locked');
  const bonusSeed = species.id === 'lantern-pod' && state.bonusSeeds > 0;
  if (!bonusSeed && state.coins < species.seedCost) {
    return rejected(state, command, 'insufficient-coins');
  }

  const roll = nextRandom(state.rngState);
  const mutationRoll = nextRandom(state.mutationRngState);
  const rainbow = state.rainbowPlots.includes(plot.id);
  const twinReady = state.plots.some((other) => other.id !== plot.id && other.plant?.speciesId === 'clockvine'
    && areAdjacent(plot.id, other.id) && ['Mature', 'Harvestable'].includes(getGrowthView('clockvine', other.plant.plantedAt - (other.plant.boostMs ?? 0) - (other.plant.clockBoostMs ?? 0), state.lastNowMs).stage));
  const plots = state.plots.slice();
  plots[plotIndex] = {
    ...plot,
    lastSeedId: species.id,
    plant: { speciesId: species.id, plantedAt: effectiveNowMs, size: rollSize(roll.value), mutationSeed: mutationRoll.value === 0 ? 0 : Math.floor(mutationRoll.value * 0x1_0000_0000), waterCount: 0, ...(twinReady ? { twinReady: true } : {}), ...(rainbow ? { rainbow: true } : {}), ...(state.fertiliser > 0 ? { fertilised: true, boostMs: Math.round(species.growthDurationMs * 0.4) } : {}) },
  };

  const nextState: GardenState = {
    ...state,
    coins: state.coins - (bonusSeed ? 0 : species.seedCost),
    bonusSeeds: state.bonusSeeds - Number(bonusSeed),
    labSeeds: labSeed ? state.labSeeds.filter((_, index) => index !== labSeedIndex) : state.labSeeds,
    rngState: roll.nextState,
    mutationRngState: mutationRoll.nextState,
    plantCount: state.plantCount + 1,
    fertiliser: Math.max(0, state.fertiliser - 1),
    rainbowPlots: rainbow ? state.rainbowPlots.filter((id) => id !== plot.id) : state.rainbowPlots,
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
