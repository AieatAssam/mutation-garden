import { MUTATIONS, mutationRoll } from '../content/mutations';
import { getGrowthView } from './growth';
import { growthStart, type GardenState, type SimEvent, type TraitId } from '../state/types';
import { levelForXp, SPECIES } from '../content/species';

/** Freeze each plant's mutation result once it reaches Mature. */
export function evaluateMature(state: GardenState, nowMs: number): { state: GardenState; events: readonly SimEvent[] } {
  let coins = state.coins;
  let xp = state.xp;
  const discoveries = [...state.discoveries];
  const rewardsPaid = [...state.rewardsPaid];
  const badLuck = { ...state.badLuck };
  let changed = false;
  const events: SimEvent[] = [];
  const plots = state.plots.map((plot) => {
    const plant = plot.plant;
    const stage = plant ? getGrowthView(plant.speciesId, growthStart(plant), nowMs).stage : 'Seed';
    if (!plant || plant.mutations !== undefined || (stage !== 'Mature' && stage !== 'Harvestable')) return plot;
    const giantEligible = conditionHolds(state, plot.id, plant, 'giant');
    const giantRoll = mutationRoll(plant.mutationSeed ?? 0xffff_ffff, 'giant');
    const charm = state.owned.includes('lucky-charm') ? 0.03 : 0;
    const mutations: TraitId[] = giantEligible || levelForXp(state.xp) >= 2 && giantRoll < MUTATIONS.giant.naturalChance + charm ? ['giant'] : [];
    const goldenEligible = conditionHolds(state, plot.id, plant, 'golden');
    const goldenRoll = mutationRoll(plant.mutationSeed ?? 0xffff_ffff, 'golden');
    const golden = goldenEligible || levelForXp(state.xp) >= 2 && goldenRoll < MUTATIONS.golden.naturalChance + charm;
    if (golden) mutations.push('golden');
    const glowingEligible = state.plots.some((other) => other.id !== plot.id && other.plant?.speciesId === 'puffcap' && areAdjacent(plot.id, other.id));
    if (glowingEligible || levelForXp(state.xp) >= 2 && mutationRoll(plant.mutationSeed ?? 0xffff_ffff, 'glowing') < MUTATIONS.glowing.naturalChance + charm) mutations.push('glowing');
    const crystalEligible = (plot.id === 'plot-0' || plot.id === 'plot-2') && state.crystalReadyPlots.includes(plot.id);
    const crystalRoll = mutationRoll(plant.mutationSeed ?? 0xffff_ffff, 'crystal');
    const crystal = (crystalEligible && (crystalRoll < MUTATIONS.crystal.ruleChance + (plant.beeVisited ? 0.1 : 0) || badLuck.crystal >= (MUTATIONS.crystal.guarantee ?? Infinity) - 1))
      || (levelForXp(state.xp) >= 2 && crystalRoll < MUTATIONS.crystal.naturalChance + charm);
    if (crystal) mutations.push('crystal');
    if (plant.rainbow) mutations.push('rainbow');
    if (crystalEligible) badLuck.crystal = crystal ? 0 : badLuck.crystal + 1;
    mutations.sort((a, b) => MUTATIONS[b].value - MUTATIONS[a].value);
    if (mutations.length) {
      let firstDiscovery = false;
      let bonusCoins = 0;
      let bonusXp = 0;
      for (const trait of mutations) {
        const id = `${plant.speciesId}:${trait}`;
        const value = SPECIES.find((entry) => entry.id === plant.speciesId)!.baseValue * MUTATIONS[trait].value;
        if (!discoveries.includes(id)) { discoveries.push(id); firstDiscovery = true; }
        if (!rewardsPaid.includes(id)) {
          rewardsPaid.push(id);
          bonusCoins += value * 10;
          bonusXp += value * 10;
        }
      }
      coins += bonusCoins;
      xp += bonusXp;
      events.push({ type: 'Mutated', plotId: plot.id, speciesId: plant.speciesId, mutations, firstDiscovery, bonusCoins, bonusXp });
    }
    changed = true;
    return { ...plot, plant: { ...plant, mutations } };
  });
  return { state: changed ? { ...state, plots, discoveries, rewardsPaid, coins, xp, badLuck,
    crystalReadyPlots: state.crystalReadyPlots.filter((id) => plots.find((plot) => plot.id === id)?.plant?.mutations === undefined) } : state, events };
}

/** Trait-specific rules live here so later traits add a condition without changing evaluation. */
export function conditionHolds(state: GardenState, plotId: string, plant: NonNullable<GardenState['plots'][number]['plant']>, trait: TraitId): boolean {
  if (trait === 'giant') return (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) >= 2;
  if (trait === 'crystal') return (plotId === 'plot-0' || plotId === 'plot-2') && state.crystalReadyPlots.includes(plotId);
  if (trait !== 'golden') return false;
  return state.plots.filter((other) => other.id !== plotId && other.plant?.speciesId === 'sunny-sprout' && areAdjacent(plotId, other.id)).length >= 2;
}

export function areAdjacent(a: string, b: string): boolean {
  const coords = (id: string): [number, number] => {
    if (id === 'plot-6') return [-5.25, 0];
    if (id === 'plot-7') return [-7.35, 0];
    const i = Number(id.slice(5)); return [i % 2 ? 1.05 : -1.05, 2 - Math.floor(i / 2) * 2];
  };
  const [ax, ay] = coords(a); const [bx, by] = coords(b);
  return Math.hypot(ax - bx, ay - by) <= 2.11;
}

export function hasGiantTell(plant: NonNullable<GardenState['plots'][number]['plant']>): boolean {
  return (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) >= 2;
}
