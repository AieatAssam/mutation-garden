import { getGrowthView } from '../plants/growth';
import { growthStart, type GardenSnapshot, type GardenState } from './types';

/** Build presentation data without adding derived fields to canonical state. */
export function getSnapshot(state: GardenState): GardenSnapshot {
  return {
    coins: state.coins,
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
