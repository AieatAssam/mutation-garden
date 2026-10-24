import { levelForXp } from '../content/species';
import type { Command, GardenState, ShopItemId, SimEvent, StepResult } from '../state/types';
import { water } from './water';

const ITEMS: Readonly<Record<ShopItemId, { price: number; level: number }>> = {
  'plot-6': { price: 40, level: 2 }, 'plot-7': { price: 120, level: 4 },
  'big-can': { price: 60, level: 3 }, fertiliser: { price: 25, level: 1 }, 'lucky-charm': { price: 150, level: 5 },
};

export function buy(state: GardenState, command: Extract<Command, { type: 'Buy' }>): StepResult {
  const item = ITEMS[command.item];
  if (!item) return reject(state, command.item, 'locked');
  if (levelForXp(state.xp) < item.level) return reject(state, command.item, 'locked');
  if (command.item !== 'fertiliser' && state.owned.includes(command.item)) return reject(state, command.item, 'owned');
  if (command.item === 'plot-7' && !state.owned.includes('plot-6')) return reject(state, command.item, 'locked');
  if (state.coins < item.price) return reject(state, command.item, 'insufficient-coins');
  const plots = command.item === 'plot-6' || command.item === 'plot-7'
    ? [...state.plots, { id: command.item, plant: null }]
    : state.plots;
  const next = { ...state, coins: state.coins - item.price, plots,
    owned: command.item === 'fertiliser' ? state.owned : [...state.owned, command.item],
    fertiliser: state.fertiliser + (command.item === 'fertiliser' ? 1 : 0) };
  return { state: next, events: [{ type: 'Bought', item: command.item }] };
}

export function waterAll(state: GardenState, nowMs: number): StepResult {
  if (!state.owned.includes('big-can')) return { state, events: [{ type: 'CommandRejected', command: 'WaterAll', plotId: 'plot-0', reason: 'locked' }] };
  let next = state;
  const events: SimEvent[] = [];
  for (const plot of state.plots) {
    if (!plot.plant) continue;
    const result = water(next, { type: 'Water', plotId: plot.id }, nowMs);
    next = result.state;
    events.push(...result.events);
  }
  return { state: next, events };
}

function reject(state: GardenState, item: ShopItemId, reason: 'locked' | 'owned' | 'insufficient-coins'): StepResult {
  return { state, events: [{ type: 'CommandRejected', command: 'Buy', plotId: item, reason }] };
}
