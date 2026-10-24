import { CRATE_CAPACITY, FRESH_BONUS, FRESH_WINDOW_MS, levelForXp, SPECIES, YIELD_SIZES } from '../content/species';
import { getGrowthView } from './growth';
import { MUTATIONS } from '../content/mutations';
import { growthStart, type Command, type GardenState, type SimEvent, type StepResult } from '../state/types';

type HarvestCommand = Extract<Command, { readonly type: 'Harvest' }>;

/** Harvest each distinct target once, preserving the order in the command. */
export function harvest(
  state: GardenState,
  command: HarvestCommand,
  effectiveNowMs: number,
): StepResult {
  let nextState = state;
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

    if (getGrowthView(plot.plant.speciesId, growthStart(plot.plant), effectiveNowMs).stage !== 'Harvestable') {
      events.push(rejection(plotId, 'not-harvestable'));
      continue;
    }

    const species = SPECIES.find((entry) => entry.id === plot.plant?.speciesId);
    if (!species) {
      events.push(rejection(plotId, 'not-harvestable'));
      continue;
    }
    if (nextState.crate.length >= CRATE_CAPACITY) { events.push(rejection(plotId, 'crate-full')); continue; }

    const size = plot.plant.size ?? 'regular';
    const ripeAt = growthStart(plot.plant) + species.growthDurationMs;
    const fresh = effectiveNowMs - ripeAt <= FRESH_WINDOW_MS;
    const mutationMultiplier = (plot.plant.mutations ?? []).reduce((product, trait) => product * MUTATIONS[trait].value, 1);
    const multiplier = YIELD_SIZES.find((entry) => entry.size === size)!.multiplier * (fresh ? 1 + FRESH_BONUS : 1) * mutationMultiplier;
    const coins = Math.max(1, Math.floor(species.baseValue * multiplier));
    const mutations = plot.plant.mutations ?? [];
    const fruit = { speciesId: species.id, size, mutations, value: coins, xp: Math.floor(species.baseValue * mutationMultiplier) };
    const plots = nextState.plots.slice();
    plots[plotIndex] = { ...plot, plant: null };
    nextState = { ...nextState, crate: [...nextState.crate, fruit], plots };
    count += 1;
    events.push({ type: 'Harvested', plotId, speciesId: species.id, coins: 0, size, fresh, lucky: false,
      ...(mutations.length ? { mutations } : {}) });
  }

  if (count > 0) events.push({ type: 'HarvestCompleted', count, coins: 0, comboBonus: 0 });
  const levelBefore = levelForXp(state.xp);
  const levelAfter = levelForXp(nextState.xp);
  for (let level = levelBefore + 1; level <= levelAfter; level += 1) {
    events.push({ type: 'LevelUp', level, unlocked: SPECIES.filter((entry) => entry.unlockLevel === level).map(({ id }) => id) });
  }
  return { state: nextState, events };
}

function rejection(
  plotId: string,
  reason: 'unknown-plot' | 'empty' | 'not-harvestable' | 'crate-full',
): SimEvent {
  return { type: 'CommandRejected', command: 'Harvest', plotId, reason };
}
