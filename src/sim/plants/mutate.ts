import { MUTATIONS, mutationRoll } from '../content/mutations';
import { getGrowthView } from './growth';
import { growthStart, type GardenState, type SimEvent, type TraitId } from '../state/types';
import { levelForXp } from '../content/species';

/** Freeze each plant's mutation result once it reaches Mature. */
export function evaluateMature(state: GardenState, nowMs: number): { state: GardenState; events: readonly SimEvent[] } {
  let badLuck = { ...state.badLuck };
  const discoveries = [...state.discoveries];
  let changed = false;
  const events: SimEvent[] = [];
  const plots = state.plots.map((plot) => {
    const plant = plot.plant;
    const stage = plant ? getGrowthView(plant.speciesId, growthStart(plant), nowMs).stage : 'Seed';
    if (!plant || plant.mutations !== undefined || (stage !== 'Mature' && stage !== 'Harvestable')) return plot;
    const eligible = conditionHolds(state, plot.id, plant, 'giant');
    const roll = mutationRoll(plant.mutationSeed ?? 0xffff_ffff, 'giant');
    const giant = plant.scriptedGiant === true || (eligible ? roll < MUTATIONS.giant.ruleChance
      : levelForXp(state.xp) >= 2 && roll < MUTATIONS.giant.naturalChance);
    const mutations: TraitId[] = giant ? ['giant'] : [];
    if (eligible && !giant) badLuck = { ...badLuck, giant: badLuck.giant + 1 };
    if (plant.scriptedGiant) badLuck = { ...badLuck, giant: 0 };
    mutations.sort((a, b) => MUTATIONS[b].value - MUTATIONS[a].value);
    const id = `${plant.speciesId}:${mutations.join('+')}`;
    if (mutations.length) {
      const firstDiscovery = !discoveries.includes(id);
      if (firstDiscovery) discoveries.push(id);
      events.push({ type: 'Mutated', plotId: plot.id, speciesId: plant.speciesId, mutations, firstDiscovery });
    }
    changed = true;
    return { ...plot, plant: { ...plant, mutations } };
  });
  return { state: changed ? { ...state, plots, badLuck, discoveries } : state, events };
}

/** Trait-specific rules live here so later traits add a condition without changing evaluation. */
export function conditionHolds(_state: GardenState, _plotId: string, plant: NonNullable<GardenState['plots'][number]['plant']>, trait: TraitId): boolean {
  return trait === 'giant' && (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) >= 2;
}

export function hasGiantTell(plant: NonNullable<GardenState['plots'][number]['plant']>): boolean {
  return plant.scriptedGiant === true || ((plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) >= 2 && mutationRoll(plant.mutationSeed ?? 0xffff_ffff, 'giant') < MUTATIONS.giant.ruleChance);
}
