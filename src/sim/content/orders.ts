import type { OrderProgress, OrderSnapshot, SimEvent, SpeciesId, TraitId } from '../state/types';

export interface OrderDefinition extends Omit<OrderSnapshot, 'progress'> {
  readonly unlockLevel: number;
  readonly event: 'FruitSold' | 'Watered' | 'HarvestCompleted';
  readonly speciesId?: SpeciesId;
  readonly mutation?: TraitId;
}

export const ORDER_DECK = [
  { title: 'Sell 3 Sunny Sprouts', target: 3, rewardCoins: 6, rewardXp: 10, unlockLevel: 1, event: 'FruitSold', speciesId: 'sunny-sprout', bonusSpeciesId: 'sunny-sprout', bonusPercent: 50 },
  { title: 'Water 4 times', target: 4, rewardCoins: 4, rewardXp: 10, unlockLevel: 1, event: 'Watered' },
  { title: 'Harvest 3 together', target: 3, rewardCoins: 6, rewardXp: 10, unlockLevel: 1, event: 'HarvestCompleted' },
  { title: 'Sell 2 Bubble Berries', target: 2, rewardCoins: 8, rewardXp: 12, unlockLevel: 2, event: 'FruitSold', speciesId: 'bubble-berry' },
  { title: 'Sell 1 Giant fruit', target: 1, rewardCoins: 6, rewardXp: 10, unlockLevel: 1, event: 'FruitSold', mutation: 'giant' },
  { title: 'Sell 2 Twistroots', target: 2, rewardCoins: 12, rewardXp: 20, unlockLevel: 3, event: 'FruitSold', speciesId: 'twistroot' },
] as const satisfies readonly OrderDefinition[];

/** Skip locked templates while cycling to the next available order. */
export function nextOrder(orderIndex: number, level: number): OrderProgress {
  for (let offset = 1; offset <= ORDER_DECK.length; offset += 1) {
    const index = (orderIndex + offset) % ORDER_DECK.length;
    if (ORDER_DECK[index]!.unlockLevel <= level) return { index, progress: 0 };
  }
  return { index: 0, progress: 0 };
}

export function getOrderSnapshot(order: OrderProgress): OrderSnapshot {
  const definition = ORDER_DECK[order.index]!;
  const { title, target, rewardCoins, rewardXp } = definition;
  const bonusSpeciesId = 'bonusSpeciesId' in definition ? definition.bonusSpeciesId : undefined;
  const bonusPercent = 'bonusPercent' in definition ? definition.bonusPercent : undefined;
  return { title, progress: order.progress, target, rewardCoins, rewardXp,
    ...(bonusSpeciesId && bonusPercent !== undefined ? { bonusSpeciesId, bonusPercent } : {}) };
}

/** Return the amount of this step's event that advances the active order. */
export function orderEventCount(definition: OrderDefinition, event: SimEvent): number {
  if (event.type !== definition.event) return 0;
  if (event.type === 'FruitSold') {
    return (definition.speciesId === undefined || event.speciesId === definition.speciesId)
      && (definition.mutation === undefined || event.mutations.includes(definition.mutation)) ? 1 : 0;
  }
  if (event.type === 'Watered') return 1;
  return event.count >= definition.target ? definition.target : 0;
}
