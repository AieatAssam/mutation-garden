import { SPECIES } from '../content/species';
import { growthStart, type GardenState, type PlotId, type SimEvent } from '../state/types';
import { areAdjacent } from './mutate';
import { getGrowthView } from './growth';
import { water } from './water';
import { harvest } from './harvest';
import { plant } from './plant';

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

/** Resolve deterministic sprinkler watering and one bee visit per plant. */
export function applyWateringAutomation(state: GardenState, nowMs: number): { state: GardenState; events: readonly SimEvent[] } {
  const sprinklerTier = state.owned.includes('sprinkler-3') ? 3 : state.owned.includes('sprinkler-2') ? 2 : state.owned.includes('sprinkler') ? 1 : 0;
  const beeTier = state.owned.includes('bee-hive-3') ? 3 : state.owned.includes('bee-hive-2') ? 2 : state.owned.includes('bee-hive') ? 1 : 0;
  if (!sprinklerTier && !beeTier) return { state, events: [] };
  let plots = state.plots.slice();
  const events: SimEvent[] = [];
  const sprinklerPlots = sprinklerTier === 3
    ? state.plots.filter(({ id }) => id === 'plot-0' || areAdjacent(id, 'plot-0')).map(({ id }) => id)
    : ['plot-0'];
  if (sprinklerTier) for (const plotId of sprinklerPlots) {
    const targetWaterCount = sprinklerTier >= 2 ? 2 : 1;
    while ((plots.find(({ id }) => id === plotId)?.plant?.sprinklerWaterCount ?? 0) < targetWaterCount) {
      const count = plots.find(({ id }) => id === plotId)?.plant?.sprinklerWaterCount ?? 0;
      if (!plots.find(({ id }) => id === plotId)?.plant) break;
      const watered = water({ ...state, plots }, { type: 'Water', plotId }, nowMs);
      if (!watered.events.some(({ type }) => type === 'Watered')) break;
      plots = watered.state.plots.map((plot) => plot.id === plotId
        ? { ...plot, plant: plot.plant ? { ...plot.plant, sprinklerWaterCount: count + 1 } : null } : plot);
      events.push(...watered.events);
    }
  }
  if (beeTier) {
    const centers = beeTier === 3 ? ['plot-2', 'plot-4'] : ['plot-2'];
    plots = plots.map((plot) => {
      if (!plot.plant || plot.plant.beeVisited || !centers.some((center) => areAdjacent(plot.id, center))) return plot;
      const stage = getGrowthView(plot.plant.speciesId, growthStart(plot.plant), nowMs).stage;
      if (stage === 'Seed' || stage === 'Mature' || stage === 'Harvestable') return plot;
      return { ...plot, plant: { ...plot.plant, beeVisited: true } };
    });
  }
  const changed = events.length > 0 || plots.some((plot, index) => plot.plant !== state.plots[index]?.plant);
  return { state: changed ? { ...state, plots } : state, events };
}

/** Run the helper on ripe plants, then replant using the plot's last successful seed. */
export function applyHarvestAutomation(state: GardenState, nowMs: number, recentlyHarvested: readonly PlotId[] = []): { state: GardenState; events: readonly SimEvent[] } {
  const helperTier = state.owned.includes('harvest-helper-3') ? 3 : state.owned.includes('harvest-helper-2') ? 2 : state.owned.includes('harvest-helper') ? 1 : 0;
  const hopperTier = state.owned.includes('seed-hopper-3') ? 3 : state.owned.includes('seed-hopper-2') ? 2 : state.owned.includes('seed-hopper') ? 1 : 0;
  let next = state;
  const events: SimEvent[] = [];
  if (helperTier) {
    const delay = helperTier === 3 ? 3_000 : helperTier === 2 ? 5_000 : 8_000;
    const ready: PlotId[] = next.plots.flatMap(({ id, plant }) => plant
      && getGrowthView(plant.speciesId, growthStart(plant), nowMs).stage === 'Harvestable'
      && nowMs >= growthStart(plant) + SPECIES.find(({ id: species }) => species === plant.speciesId)!.growthDurationMs + delay ? [id] : []);
    const result = harvest(next, { type: 'Harvest', plotIds: ready.slice(0, helperTier === 3 ? 2 : 1) }, nowMs);
    next = result.state;
    events.push(...result.events);
  }
  if (hopperTier) {
    const candidates = hopperTier === 1
      ? [...recentlyHarvested, ...events.filter((event) => event.type === 'Harvested').map(({ plotId }) => plotId)]
      : next.plots.filter(({ plant, lastSeedId }) => !plant && lastSeedId).map(({ id }) => id);
    for (const plotId of [...new Set(candidates)]) {
      const target = next.plots.find(({ id }) => id === plotId);
      if (!target?.lastSeedId || target.plant) continue;
      const result = plant(next, { type: 'Plant', plotId, seedId: target.lastSeedId }, nowMs);
      next = result.state;
      events.push(...result.events);
      if (hopperTier < 3 && result.events.some((event) => event.type === 'Planted')) break;
    }
  }
  return { state: next, events };
}
