import { getGrowthView } from '../plants/growth';
import { levelForXp, SPECIES, xpForLevel } from '../content/species';
import { crateCapacity, saleIntervalMs } from '../content/species';
import { growthStart, type GardenSnapshot, type GardenState } from './types';
import { areAdjacent, hasGiantTell } from '../plants/mutate';
import { getOrderSnapshot } from '../content/orders';

/** Build presentation data without adding derived fields to canonical state. */
export function getSnapshot(state: GardenState): GardenSnapshot {
  const level = levelForXp(state.xp);
  const plots = state.plots.map((plot) => {
    if (!plot.plant) return { id: plot.id, plant: null };
    const growth = getGrowthView(plot.plant.speciesId, growthStart(plot.plant), state.lastNowMs);
    const tell: import('./types').TraitId | null = growth.stage !== 'Seed' && growth.stage !== 'Mature' && growth.stage !== 'Harvestable' && hasGiantTell(plot.plant) ? 'giant' : null;
    return { id: plot.id, plant: { ...plot.plant, ...growth, tell } };
  });
  const mutationProgress = plots.flatMap(({ id, plant }) => {
    if (!plant || plant.mutations !== undefined || (plant.stage !== 'Sprout' && plant.stage !== 'Growing')) return [];
    return [{
      plotId: id,
      giantWaters: plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1),
      goldenNeighbours: goldenNeighbours(state, id),
      glowingNeighbours: state.plots.filter((other) => other.id !== id && other.plant?.speciesId === 'puffcap' && areAdjacent(id, other.id)).length,
    }];
  });
  return {
    coins: state.coins,
    bonusSeeds: state.bonusSeeds,
    xp: state.xp,
    level,
    levelStartXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    nowMs: state.lastNowMs,
    plantCount: state.plantCount,
    scriptedGiantUsed: state.scriptedGiantUsed,
    scriptedGoldenUsed: state.scriptedGoldenUsed,
    owned: state.owned,
    fertiliser: state.fertiliser,
    crate: state.crate,
    labSpecimens: state.labSpecimens,
    labSeeds: state.labSeeds,
    crateCount: state.crate.length,
    crateCapacity: crateCapacity(state.owned),
    selling: state.sellingSince !== null,
    saleIntervalMs: saleIntervalMs(state.owned),
    nextSaleTime: state.sellingSince === null ? null : state.sellingSince + saleIntervalMs(state.owned),
    plots,
    discoveries: state.discoveries,
    rewardsPaid: state.rewardsPaid,
    order: getOrderSnapshot(state.order),
    mutationProgress,
    nearMiss: plots.some(({ id, plant }) => plant && plant.stage !== 'Mature' && plant.stage !== 'Harvestable'
      && goldenNeighbours(state, id) === 1 && state.coins >= SPECIES.find(({ id }) => id === 'sunny-sprout')!.seedCost
      && plots.some((other) => !other.plant && areAdjacent(id, other.id)))
      ? 'Plant one more Sunny Sprout beside it for Golden.'
      : plots.some(({ plant }) => plant && plant.stage !== 'Mature' && plant.stage !== 'Harvestable' && (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) === 1)
        ? 'Water it again to grow a Giant.' : null,
  };
}

function goldenNeighbours(state: GardenState, id: string): number {
  return state.plots.filter((plot) => plot.id !== id && plot.plant?.speciesId === 'sunny-sprout' && areAdjacent(id, plot.id)).length;
}
