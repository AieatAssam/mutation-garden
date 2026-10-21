import { COMBO_CAP, COMBO_STEP, FRESH_BONUS, FRESH_WINDOW_MS, SPECIES, YIELD_SIZES } from '../content/species';
import { getGrowthView } from './growth';
import { growthStart, type Command, type GardenState, type SimEvent, type StepResult } from '../state/types';

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

    if (getGrowthView(plot.plant.speciesId, growthStart(plot.plant), effectiveNowMs).stage !== 'Harvestable') {
      events.push(rejection(plotId, 'not-harvestable'));
      continue;
    }

    const species = SPECIES.find((entry) => entry.id === plot.plant?.speciesId);
    if (!species) {
      events.push(rejection(plotId, 'not-harvestable'));
      continue;
    }

    const size = plot.plant.size ?? 'regular';
    const ripeAt = growthStart(plot.plant) + species.growthDurationMs;
    const fresh = effectiveNowMs - ripeAt <= FRESH_WINDOW_MS;
    const multiplier = YIELD_SIZES.find((entry) => entry.size === size)!.multiplier * (fresh ? 1 + FRESH_BONUS : 1);
    const coins = Math.max(1, Math.floor(species.baseValue * multiplier));
    const plots = nextState.plots.slice();
    plots[plotIndex] = { ...plot, plant: null };
    nextState = { ...nextState, coins: nextState.coins + coins, plots };
    totalCoins += coins;
    count += 1;
    events.push({ type: 'Harvested', plotId, speciesId: species.id, coins, size, fresh });
  }

  // A swipe across several ripe plants pays a combo bonus on top (design.md 4.3).
  const comboBonus = count > 1 ? Math.floor(totalCoins * Math.min(COMBO_CAP, COMBO_STEP * (count - 1))) : 0;
  if (comboBonus > 0) nextState = { ...nextState, coins: nextState.coins + comboBonus };
  totalCoins += comboBonus;
  if (count > 0) events.push({ type: 'HarvestCompleted', count, coins: totalCoins, comboBonus });
  return { state: nextState, events };
}

function rejection(
  plotId: string,
  reason: 'unknown-plot' | 'empty' | 'not-harvestable',
): SimEvent {
  return { type: 'CommandRejected', command: 'Harvest', plotId, reason };
}
