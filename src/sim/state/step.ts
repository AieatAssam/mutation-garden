import type { Command, GardenState, StepResult } from './types';
import { plant } from '../plants/plant';
import { harvest } from '../plants/harvest';
import { water } from '../plants/water';
import { collectGrowthEvents } from '../plants/growth';
import { evaluateMature } from '../plants/mutate';
import { buy, waterAll } from '../plants/shop';
import { levelForXp, saleIntervalMs, SPECIES } from '../content/species';
import { nextOrder, orderEventCount, ORDER_DECK } from '../content/orders';

function assertTimestamp(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Timestamp must be a nonnegative safe integer');
  }
}

/** Advance the canonical simulation clock, then apply supported commands in order. */
export function step(
  state: GardenState,
  commands: readonly Command[],
  nowMs: number,
): StepResult {
  assertTimestamp(nowMs);
  const effectiveNowMs = Math.max(state.lastNowMs, nowMs);
  const events: StepResult['events'][number][] = [...collectGrowthEvents(state, state.lastNowMs, effectiveNowMs)];
  let nextState = effectiveNowMs === state.lastNowMs
    ? state
    : { ...state, lastNowMs: effectiveNowMs };
  if (nextState.sellingSince !== null && nextState.crate.length) {
    const sales = Math.min(nextState.crate.length, Math.floor((effectiveNowMs - nextState.sellingSince) / saleIntervalMs(nextState.owned)));
    if (sales) {
      const crate = nextState.crate.slice(sales);
      const sold = nextState.crate.slice(0, sales);
      const value = (fruit: typeof sold[number]) => Math.floor(fruit.value * (nextState.owned.includes('fresh-produce') ? 1.1 : 1));
      const coins = nextState.coins + sold.reduce((sum, fruit) => sum + value(fruit), 0);
      const xp = nextState.xp + sold.reduce((sum, fruit) => sum + fruit.xp, 0);
      for (const fruit of sold) events.push({ type: 'FruitSold', value: value(fruit), speciesId: fruit.speciesId, mutations: fruit.mutations });
      nextState = { ...nextState, crate, coins, xp, sellingSince: crate.length ? nextState.sellingSince + sales * saleIntervalMs(nextState.owned) : null };
      for (let level = levelForXp(state.xp) + 1; level <= levelForXp(nextState.xp); level += 1) {
        events.push({ type: 'LevelUp', level, unlocked: SPECIES.filter((entry) => entry.unlockLevel === level).map(({ id }) => id) });
      }
    }
  }

  if (commands.some((command) => command.type === 'Harvest')) {
    const mature = evaluateMature(nextState, effectiveNowMs);
    nextState = mature.state;
    events.push(...mature.events);
  }

  for (const command of commands) {
    const result = command.type === 'StartSelling'
      ? { state: nextState.crate.length ? { ...nextState, sellingSince: nextState.sellingSince ?? effectiveNowMs } : nextState, events: [] }
      : command.type === 'Plant'
      ? plant(nextState, command, effectiveNowMs)
      : command.type === 'Water'
        ? water(nextState, command, effectiveNowMs)
        : command.type === 'Harvest'
          ? harvest(nextState, command, effectiveNowMs)
          : command.type === 'Buy'
            ? buy(nextState, command)
            : waterAll(nextState, effectiveNowMs);
    nextState = result.state;
    events.push(...result.events);
  }

  const mutationResult = evaluateMature(nextState, effectiveNowMs);
  nextState = mutationResult.state;
  events.push(...mutationResult.events);

  const order = nextState.order;
  const definition = ORDER_DECK[order.index];
  if (definition) {
    let progress = order.progress;
    for (const event of events) {
      progress += orderEventCount(definition, event);
      if (progress < definition.target) continue;
      nextState = {
        ...nextState,
        coins: nextState.coins + definition.rewardCoins,
        xp: nextState.xp + definition.rewardXp,
        order: nextOrder(order.index, levelForXp(nextState.xp + definition.rewardXp)),
      };
      events.push({ type: 'OrderCompleted', title: definition.title, coins: definition.rewardCoins, xp: definition.rewardXp });
      break;
    }
    if (progress < definition.target && progress !== order.progress) nextState = { ...nextState, order: { ...order, progress } };
  }

  for (let level = levelForXp(state.xp) + 1; level <= levelForXp(nextState.xp); level += 1) {
    if (!events.some((event) => event.type === 'LevelUp' && event.level === level)) {
      events.push({ type: 'LevelUp', level, unlocked: SPECIES.filter((entry) => entry.unlockLevel === level).map(({ id }) => id) });
    }
  }

  return { state: nextState, events };
}
