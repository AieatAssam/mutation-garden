import { getGrowthView } from '../plants/growth';
import { levelForXp, xpForLevel } from '../content/species';
import { CRATE_CAPACITY, SELL_INTERVAL_MS } from '../content/species';
import { growthStart, type GardenSnapshot, type GardenState } from './types';
import { areAdjacent, hasGiantTell } from '../plants/mutate';

/** Build presentation data without adding derived fields to canonical state. */
export function getSnapshot(state: GardenState): GardenSnapshot {
  const level = levelForXp(state.xp);
  const plots = state.plots.map((plot) => {
    if (!plot.plant) return { id: plot.id, plant: null };
    const growth = getGrowthView(plot.plant.speciesId, growthStart(plot.plant), state.lastNowMs);
    const tell: import('./types').TraitId | null = growth.stage !== 'Seed' && growth.stage !== 'Mature' && growth.stage !== 'Harvestable' && hasGiantTell(plot.plant) ? 'giant' : null;
    return { id: plot.id, plant: { ...plot.plant, ...growth, tell } };
  });
  return {
    coins: state.coins,
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
    crateCount: state.crate.length,
    crateCapacity: CRATE_CAPACITY,
    selling: state.sellingSince !== null,
    nextSaleTime: state.sellingSince === null ? null : state.sellingSince + SELL_INTERVAL_MS,
    plots,
    nearMiss: plots.some(({ id, plant }) => plant && plant.stage !== 'Mature' && plant.stage !== 'Harvestable' && goldenNeighbours(state, id) === 1)
      ? 'Plant one more Sunny Sprout beside it for Golden.'
      : plots.some(({ plant }) => plant && plant.stage !== 'Mature' && plant.stage !== 'Harvestable' && (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) === 1)
        ? 'Water it again to grow a Giant.' : null,
  };
}

function goldenNeighbours(state: GardenState, id: string): number {
  return state.plots.filter((plot) => plot.id !== id && plot.plant?.speciesId === 'sunny-sprout' && areAdjacent(id, plot.id)).length;
}
