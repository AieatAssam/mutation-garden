import { COMBO_CAP, COMBO_STEP, crateCapacity, FRESH_BONUS, FRESH_WINDOW_MS, levelForXp, SPECIES, YIELD_SIZES } from '../content/species';
import { getGrowthView } from './growth';
import { MUTATIONS } from '../content/mutations';
import { nextRandom } from '../state/rng';
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
  const crystalReadyPlots = new Set(state.crystalReadyPlots);
  const rainbowPlots = new Set(state.rainbowPlots);
  const harvestedTraits = new Set<string>();
  const harvestedPlotIds = new Set<string>();
  const events: SimEvent[] = [];
  const seenPlotIds = new Set<string>();
  let harvestedFruitCount = 0;

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
    const yieldCount = species.id === 'comet-pear' ? 2 : 1;
    if (nextState.crate.length + yieldCount > crateCapacity(nextState.owned)) { events.push(rejection(plotId, 'crate-full')); continue; }

    const size = plot.plant.size ?? 'regular';
    const ripeAt = growthStart(plot.plant) + species.growthDurationMs;
    const fresh = effectiveNowMs - ripeAt <= FRESH_WINDOW_MS;
    const mutationMultiplier = (plot.plant.mutations ?? []).reduce((product, trait) => product * MUTATIONS[trait].value, 1);
    const multiplier = YIELD_SIZES.find((entry) => entry.size === size)!.multiplier * (fresh ? 1 + FRESH_BONUS : 1) * mutationMultiplier;
    const mutations = plot.plant.mutations ?? [];
    const roll = nextRandom(nextState.rngState);
    nextState = { ...nextState, rngState: roll.nextState };
    const lucky = roll.value < 0.1;
    const ordinaryValue = Math.max(1, Math.floor(species.baseValue * multiplier));
    const coins = ordinaryValue * (lucky ? 3 : 1);
    const bonusSeed = species.id === 'lantern-pod' && isDusk(effectiveNowMs);
    if (mutations.includes('glowing')) crystalReadyPlots.add(plotId);
    for (const trait of mutations) harvestedTraits.add(trait);
    const xp = Math.floor(species.baseValue * mutationMultiplier);
    const fruit = { speciesId: species.id, size, mutations, value: coins, xp };
    const plots = nextState.plots.slice();
    plots[plotIndex] = { ...plot, plant: null };
    nextState = { ...nextState, crate: [...nextState.crate, fruit, ...(yieldCount === 2 ? [fruit] : [])], plots };
    if (bonusSeed) nextState = { ...nextState, bonusSeeds: nextState.bonusSeeds + 1 };
    count += 1;
    harvestedFruitCount += yieldCount;
    harvestedPlotIds.add(plotId);
    events.push({ type: 'Harvested', plotId, speciesId: species.id, coins: 0, size, fresh, lucky,
      ...(mutations.length ? { mutations } : {}), ...(bonusSeed ? { bonusSeed: true as const } : {}) });
    if (lucky) events.push({ type: 'LuckyHarvest', plotId });
  }
  const comboRate = Math.min(COMBO_CAP, Math.max(0, count - 1) * COMBO_STEP);
  let comboBonus = 0;
  if (comboRate > 0) {
    const firstFruitIndex = nextState.crate.length - harvestedFruitCount;
    const crate = nextState.crate.slice();
    let batchValue = 0;
    for (let index = firstFruitIndex; index < crate.length; index += 1) {
      batchValue += crate[index]!.value;
    }
    comboBonus = Math.max(count - 2, Math.floor(batchValue * comboRate));
    let distributedBonus = 0;
    for (let index = firstFruitIndex; index < crate.length; index += 1) {
      const bonus = Math.floor(crate[index]!.value * comboRate);
      crate[index] = { ...crate[index]!, value: crate[index]!.value + bonus };
      distributedBonus += bonus;
    }
    const lastFruitIndex = crate.length - 1;
    if (lastFruitIndex >= firstFruitIndex) crate[lastFruitIndex] = { ...crate[lastFruitIndex]!, value: crate[lastFruitIndex]!.value + comboBonus - distributedBonus };
    nextState = { ...nextState, crate };
  }
  if (harvestedTraits.has('golden') && harvestedTraits.has('glowing') && harvestedTraits.has('crystal')) {
    for (const plotId of harvestedPlotIds) {
      if (state.plots.find((plot) => plot.id === plotId)?.plant?.mutations?.some((trait) => ['golden', 'glowing', 'crystal'].includes(trait))) rainbowPlots.add(plotId);
    }
  }
  if (crystalReadyPlots.size !== state.crystalReadyPlots.length || rainbowPlots.size !== state.rainbowPlots.length) {
    nextState = { ...nextState, crystalReadyPlots: [...crystalReadyPlots], rainbowPlots: [...rainbowPlots] };
  }

  if (count > 0) events.push({ type: 'HarvestCompleted', count, coins: 0, comboBonus });
  const levelBefore = levelForXp(state.xp);
  const levelAfter = levelForXp(nextState.xp);
  for (let level = levelBefore + 1; level <= levelAfter; level += 1) {
    events.push({ type: 'LevelUp', level, unlocked: SPECIES.filter((entry) => entry.unlockLevel === level).map(({ id }) => id) });
  }
  return { state: nextState, events };
}

function isDusk(nowMs: number): boolean {
  const dayMs = 86_400_000;
  const hourMs = 3_600_000;
  const utcTime = nowMs % dayMs;
  return utcTime >= 18 * hourMs && utcTime < 20 * hourMs;
}

function rejection(
  plotId: string,
  reason: 'unknown-plot' | 'empty' | 'not-harvestable' | 'crate-full',
): SimEvent {
  return { type: 'CommandRejected', command: 'Harvest', plotId, reason };
}
