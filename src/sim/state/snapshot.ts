import { getGrowthView } from '../plants/growth';
import { levelForXp, xpForLevel } from '../content/species';
import { growthStart, type GardenSnapshot, type GardenState } from './types';
import { hasGiantTell } from '../plants/mutate';

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
    plots,
    nearMiss: level >= 4 && plots.some(({ plant }) => plant && plant.stage !== 'Mature' && plant.stage !== 'Harvestable' && (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) === 1)
      ? 'Water it once more for a chance of Giant.' : null,
  };
}
