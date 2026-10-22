import { getGrowthView } from '../plants/growth';
import { levelForXp, xpForLevel } from '../content/species';
import { growthStart, type GardenSnapshot, type GardenState } from './types';

/** Build presentation data without adding derived fields to canonical state. */
export function getSnapshot(state: GardenState): GardenSnapshot {
  const level = levelForXp(state.xp);
  return {
    coins: state.coins,
    xp: state.xp,
    level,
    levelStartXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    nowMs: state.lastNowMs,
    plots: state.plots.map((plot) => ({
      id: plot.id,
      plant: plot.plant === null
        ? null
        : {
            ...plot.plant,
            ...getGrowthView(plot.plant.speciesId, growthStart(plot.plant), state.lastNowMs),
          },
    })),
  };
}
