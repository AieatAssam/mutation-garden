import { getSnapshot, SPECIES, step, type GardenState, type PlotId, type SpeciesId } from '../sim';

export const OFFLINE_CAP_MS = 2 * 60 * 60 * 1_000;

/** Shift the wall clock so a resumed loop advances by at most the offline cap. */
export function capClockOffset(offsetMs: number, lastNowMs: number, wallNowMs: number): number {
  return Math.max(offsetMs, wallNowMs - lastNowMs - OFFLINE_CAP_MS);
}

export interface OfflineAdvance {
  readonly state: GardenState;
  readonly elapsedMs: number;
  readonly plantsGrown: number;
  readonly plotsWatered: number;
  readonly fruitHarvested: number;
  readonly coinsSold: number;
  readonly crateContents: readonly { readonly speciesId: SpeciesId; readonly count: number }[];
  readonly ripePlotIds: readonly PlotId[];
  readonly events: readonly import('../sim').SimEvent[];
}

/** Advance a loaded save by at most two hours and summarize the events produced by the sim. */
export function advanceOffline(state: GardenState, savedAt: number, nowMs: number): OfflineAdvance {
  const elapsedMs = Math.min(OFFLINE_CAP_MS, Math.max(0, nowMs - savedAt));
  const targetMs = Math.max(state.lastNowMs, Math.min(nowMs, state.lastNowMs + elapsedMs));
  const result = step(state, [], targetMs);
  const { events } = result;
  const crateCounts = new Map<SpeciesId, number>();
  for (const fruit of result.state.crate) crateCounts.set(fruit.speciesId, (crateCounts.get(fruit.speciesId) ?? 0) + 1);
  return {
    state: result.state,
    elapsedMs,
    plantsGrown: events.filter((event) => event.type === 'Harvestable').length,
    plotsWatered: new Set(events.filter((event) => event.type === 'Watered').map(({ plotId }) => plotId)).size,
    fruitHarvested: events.filter((event) => event.type === 'Harvested').length,
    coinsSold: events.reduce((sum, event) => sum + (event.type === 'FruitSold' ? event.value : 0), 0),
    crateContents: SPECIES.flatMap(({ id }) => {
      const count = crateCounts.get(id) ?? 0;
      return count ? [{ speciesId: id, count }] : [];
    }),
    ripePlotIds: getSnapshot(result.state).plots.filter(({ plant }) => plant?.stage === 'Harvestable').map(({ id }) => id),
    events,
  };
}
