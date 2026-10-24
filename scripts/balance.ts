import { createInitialState, getSnapshot, SPECIES, step, type GardenState } from '../src/sim';
import { SHOP_PRICES } from '../src/sim/content/species';

const SHOP_ORDER = ['big-can', 'plot-6', 'fertiliser', 'plot-7', 'lucky-charm'] as const;
export function runGreedy(minutes = 60, seed = 123): { state: GardenState; milestones: Record<string, number>; rows: string[]; purchases: number[] } {
  let state = createInitialState(seed, 0);
  const milestones: Record<string, number> = { 'first harvest': -1, 'first mutation': -1, 'level 2': -1, 'first purchase': -1, 'plot 7': -1, 'Puffcap / level 4': -1 };
  const rows: string[] = [];
  const purchases: number[] = [];
  let lastPurchaseAt = -120_000;
  let minuteCoins = state.coins;
  for (let tick = 1; tick <= minutes * 60; tick++) {
    const now = tick * 1_000;
    const advanced = step(state, [], now);
    state = advanced.state;
    const snapshot = getSnapshot(state);
    const commands: Parameters<typeof step>[1][number][] = [];
    if (state.crate.length >= 6 && state.sellingSince === null) commands.push({ type: 'StartSelling' });
    const ripe = snapshot.plots.filter(({ plant }) => plant?.stage === 'Harvestable').map(({ id }) => id);
    if (ripe.length) commands.push({ type: 'Harvest', plotIds: ripe });
    const species = SPECIES.filter((item) => item.unlockLevel <= snapshot.level && item.seedCost <= state.coins)
      .sort((a, b) => b.baseValue / b.growthDurationMs - a.baseValue / a.growthDurationMs)[0];
    if (species) {
      const plot = snapshot.plots.find(({ plant }) => !plant);
      if (plot && !plot.plant) commands.push({ type: 'Plant', plotId: plot.id, seedId: species.id });
    }
    for (const item of SHOP_ORDER) {
      if (item === 'fertiliser' && !state.owned.includes('plot-6')) continue;
      if (state.owned.includes(item) || now - lastPurchaseAt < 120_000) continue;
      if (item === 'plot-7' && !state.owned.includes('plot-6')) continue;
      if (state.coins >= SHOP_PRICES[item] && snapshot.level >= ({ 'plot-6': 3, 'big-can': 3, 'plot-7': 4, fertiliser: 1, 'lucky-charm': 5 }[item])) {
        commands.push({ type: 'Buy', item }); break;
      }
    }
    const result = step(state, commands, now); state = result.state;
    const level = getSnapshot(state).level;
    for (const event of [...advanced.events, ...result.events]) {
      if (event.type === 'LevelUp' && event.level === 2 && milestones['level 2']! < 0) milestones['level 2'] = now;
      if (event.type === 'LevelUp' && event.level === 4 && milestones['Puffcap / level 4']! < 0) milestones['Puffcap / level 4'] = now;
      if (event.type === 'Harvested' && milestones['first harvest']! < 0) milestones['first harvest'] = now;
      if (event.type === 'Mutated' && event.mutations.length > 0 && milestones['first mutation']! < 0) milestones['first mutation'] = now;
      if (event.type === 'Bought') {
        purchases.push(now);
        lastPurchaseAt = now;
        if (milestones['first purchase']! < 0) milestones['first purchase'] = now;
        if (event.item === 'plot-6' && milestones['plot 7']! < 0) milestones['plot 7'] = now;
      }
    }
    if (level >= 2 && milestones['level 2']! < 0) milestones['level 2'] = now;
    if (level >= 4 && milestones['Puffcap / level 4']! < 0) milestones['Puffcap / level 4'] = now;
    if (tick % 60 === 0) {
      const minute = tick / 60;
      rows.push(`${minute}\t${state.coins}\t${level}\t${state.coins - minuteCoins}\t${state.owned.join(',') || '-'}\t${Object.entries(milestones).filter(([, time]) => time >= 0 && time <= now).map(([name]) => name).join(',') || '-'}`);
      minuteCoins = state.coins;
    }
  }
  return { state, milestones, rows, purchases };
}
