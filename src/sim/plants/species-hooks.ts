import { SPECIES } from '../content/species';
import { growthStart, type GardenState, type SimEvent } from '../state/types';
import { areAdjacent } from './mutate';
import { getGrowthView } from './growth';
import { water } from './water';

/** Resolve crop-to-crop effects from one deterministic simulation timestamp. */
export function applySpeciesHooks(state: GardenState, nowMs: number): { state: GardenState; events: readonly SimEvent[] } {
  const plots = state.plots.slice();
  let changed = false;
  const events: SimEvent[] = [];
  for (let index = 0; index < plots.length; index += 1) {
    const plant = plots[index]?.plant;
    if (plant?.speciesId !== 'clockvine') continue;
    const definition = SPECIES.find(({ id }) => id === 'clockvine')!;
    const before = nowMs - growthStart(plant);
    if (before >= definition.growthDurationMs) continue;
    const already = new Set(plant.clockBoostedBy ?? []);
    const ripe = state.plots.filter(({ id, plant: neighbor }) => id !== plots[index]!.id && neighbor
      && areAdjacent(plots[index]!.id, id)
      && getGrowthView(neighbor.speciesId, growthStart(neighbor), nowMs).stage === 'Harvestable'
      && !already.has(id)).map(({ id }) => id);
    if (!ripe.length) continue;
    const addedBoostMs = Math.min(ripe.length * 2_000, definition.growthDurationMs - before);
    const updated = { ...plant, clockBoostMs: (plant.clockBoostMs ?? 0) + addedBoostMs, clockBoostedBy: [...already, ...ripe] };
    const after = nowMs - growthStart(updated);
    for (const stage of definition.stages) {
      if (stage.stage === 'Seed' || before >= stage.startsAtMs || after < stage.startsAtMs) continue;
      events.push(stage.stage === 'Harvestable'
        ? { type: 'Harvestable', plotId: plots[index]!.id }
        : { type: 'StageReached', plotId: plots[index]!.id, stage: stage.stage });
    }
    plots[index] = { ...plots[index]!, plant: updated };
    changed = true;
  }
  for (let index = 0; index < plots.length; index += 1) {
    const dewbell = plots[index]?.plant;
    if (dewbell?.speciesId !== 'dewbell' || dewbell.dewUsed
      || getGrowthView(dewbell.speciesId, growthStart(dewbell), nowMs).stage !== 'Harvestable') continue;
    const target = plots.find(({ id, plant }) => plant && areAdjacent(plots[index]!.id, id)
      && getGrowthView(plant.speciesId, growthStart(plant), nowMs).stage !== 'Seed'
      && getGrowthView(plant.speciesId, growthStart(plant), nowMs).stage !== 'Harvestable'
      && (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) < 2);
    if (!target) continue;
    const result = water({ ...state, plots }, { type: 'Water', plotId: target.id }, nowMs);
    if (!result.events.some(({ type }) => type === 'Watered')) continue;
    for (const plot of result.state.plots) {
      const targetIndex = plots.findIndex(({ id }) => id === plot.id);
      if (targetIndex >= 0 && plot.id === target.id) plots[targetIndex] = plot;
    }
    const current = plots[index]!;
    plots[index] = { ...current, plant: { ...current.plant!, dewUsed: true } };
    events.push(...result.events);
    changed = true;
  }
  return { state: changed ? { ...state, plots } : state, events };
}
