import type { GrowthStage, SpeciesId } from '../state/types';

export interface GrowthStageDefinition {
  readonly stage: GrowthStage;
  readonly startsAtMs: number;
}

export interface SpeciesDefinition {
  readonly id: SpeciesId;
  readonly name: string;
  readonly seedCost: number;
  readonly baseValue: number;
  readonly growthDurationMs: number;
  /** Garden level at which the seed unlocks. */
  readonly unlockLevel: number;
  readonly stages: readonly GrowthStageDefinition[];
}

export const SPECIES = [
  {
    id: 'sunny-sprout',
    name: 'Sunny Sprout',
    seedCost: 1,
    baseValue: 2,
    growthDurationMs: 8_000,
    unlockLevel: 1,
    stages: [
      { stage: 'Seed', startsAtMs: 0 },
      { stage: 'Sprout', startsAtMs: 1000 },
      { stage: 'Growing', startsAtMs: 3000 },
      { stage: 'Mature', startsAtMs: 7000 },
      { stage: 'Harvestable', startsAtMs: 8000 },
    ],
  },
  {
    id: 'bubble-berry',
    name: 'Bubble Berry',
    seedCost: 3,
    baseValue: 6,
    growthDurationMs: 15000,
    unlockLevel: 2,
    stages: [
      { stage: 'Seed', startsAtMs: 0 },
      { stage: 'Sprout', startsAtMs: 2000 },
      { stage: 'Growing', startsAtMs: 6000 },
      { stage: 'Mature', startsAtMs: 13000 },
      { stage: 'Harvestable', startsAtMs: 15000 },
    ],
  },
  {
    id: 'twistroot',
    name: 'Twistroot',
    seedCost: 5,
    baseValue: 10,
    growthDurationMs: 25000,
    unlockLevel: 3,
    stages: [
      { stage: 'Seed', startsAtMs: 0 },
      { stage: 'Sprout', startsAtMs: 3000 },
      { stage: 'Growing', startsAtMs: 10000 },
      { stage: 'Mature', startsAtMs: 22000 },
      { stage: 'Harvestable', startsAtMs: 25000 },
    ],
  },
  {
    id: 'puffcap', name: 'Puffcap', seedCost: 6, baseValue: 14, growthDurationMs: 30_000, unlockLevel: 4,
    stages: [{ stage: 'Seed', startsAtMs: 0 }, { stage: 'Sprout', startsAtMs: 4_000 }, { stage: 'Growing', startsAtMs: 12_000 }, { stage: 'Mature', startsAtMs: 26_000 }, { stage: 'Harvestable', startsAtMs: 30_000 }],
  },
  {
    id: 'lantern-pod', name: 'Lantern Pod', seedCost: 12, baseValue: 28, growthDurationMs: 45_000, unlockLevel: 6,
    stages: [{ stage: 'Seed', startsAtMs: 0 }, { stage: 'Sprout', startsAtMs: 4_000 }, { stage: 'Growing', startsAtMs: 18_000 }, { stage: 'Mature', startsAtMs: 38_000 }, { stage: 'Harvestable', startsAtMs: 45_000 }],
  },
  {
    id: 'comet-pear', name: 'Comet Pear', seedCost: 24, baseValue: 58, growthDurationMs: 75_000, unlockLevel: 9,
    stages: [{ stage: 'Seed', startsAtMs: 0 }, { stage: 'Sprout', startsAtMs: 7_500 }, { stage: 'Growing', startsAtMs: 30_000 }, { stage: 'Mature', startsAtMs: 60_000 }, { stage: 'Harvestable', startsAtMs: 75_000 }],
  },
  {
    id: 'clockvine', name: 'Clockvine', seedCost: 20, baseValue: 46, growthDurationMs: 55_000, unlockLevel: 11,
    stages: [{ stage: 'Seed', startsAtMs: 0 }, { stage: 'Sprout', startsAtMs: 5_500 }, { stage: 'Growing', startsAtMs: 22_000 }, { stage: 'Mature', startsAtMs: 44_000 }, { stage: 'Harvestable', startsAtMs: 55_000 }],
  },
  {
    id: 'dewbell', name: 'Dewbell', seedCost: 34, baseValue: 82, growthDurationMs: 90_000, unlockLevel: 13,
    stages: [{ stage: 'Seed', startsAtMs: 0 }, { stage: 'Sprout', startsAtMs: 9_000 }, { stage: 'Growing', startsAtMs: 36_000 }, { stage: 'Mature', startsAtMs: 72_000 }, { stage: 'Harvestable', startsAtMs: 90_000 }],
  },
] as const satisfies readonly SpeciesDefinition[];

export const INITIAL_COINS = 12;

/** Total XP needed to reach level 2, 3, ... (design.md 4.4); after the table each level costs 200 more. */
export const LEVEL_XP = [500, 900, 2_500, 3_500, 4_900, 6_500, 8_300, 10_300] as const;

export const SHOP_PRICES = { 'plot-6': 80, 'plot-7': 220, 'big-can': 90, fertiliser: 30, 'lucky-charm': 300, 'quick-counter-1': 45, 'quick-counter-2': 180, 'quick-counter-3': 600, 'crate-1': 70, 'crate-2': 300, 'second-counter': 350, 'fresh-produce': 160 } as const;
export const CRATE_CAPACITY = 12;
export const SELL_INTERVAL_MS = 1_200;
export const SELLING_UPGRADES = [
  { id: 'quick-counter-1', title: 'Quick Counter I', desc: 'Sell each fruit in 1 second.', price: SHOP_PRICES['quick-counter-1'], level: 4 },
  { id: 'quick-counter-2', title: 'Quick Counter II', desc: 'Sell each fruit in 0.8 seconds.', price: SHOP_PRICES['quick-counter-2'], level: 7, requires: 'quick-counter-1' },
  { id: 'quick-counter-3', title: 'Quick Counter III', desc: 'Sell each fruit in 0.6 seconds.', price: SHOP_PRICES['quick-counter-3'], level: 10, requires: 'quick-counter-2' },
  { id: 'crate-1', title: 'Crate I', desc: 'Hold 18 fruit.', price: SHOP_PRICES['crate-1'], level: 5 },
  { id: 'crate-2', title: 'Crate II', desc: 'Hold 24 fruit.', price: SHOP_PRICES['crate-2'], level: 9, requires: 'crate-1' },
  { id: 'second-counter', title: 'Second Counter', desc: 'Sell twice as fast.', price: SHOP_PRICES['second-counter'], level: 8 },
  { id: 'fresh-produce', title: 'Fresh Produce sign', desc: 'Add 10% to sale value.', price: SHOP_PRICES['fresh-produce'], level: 6 },
] as const;

export function saleIntervalMs(owned: readonly import('../state/types').ShopItemId[]): number {
  const counter = owned.includes('quick-counter-3') ? 600 : owned.includes('quick-counter-2') ? 800 : owned.includes('quick-counter-1') ? 1_000 : SELL_INTERVAL_MS;
  return owned.includes('second-counter') ? counter / 2 : counter;
}

export function crateCapacity(owned: readonly import('../state/types').ShopItemId[]): number {
  return owned.includes('crate-2') ? 24 : owned.includes('crate-1') ? 18 : CRATE_CAPACITY;
}

/** XP needed to reach a level (level 1 needs 0). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level - 2 < LEVEL_XP.length) return LEVEL_XP[level - 2]!;
  return LEVEL_XP[LEVEL_XP.length - 1]! + 200 * (level - 1 - LEVEL_XP.length);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

/** Yield sizes rolled at planting: chance and value multiplier (design.md 4.3). */
export const YIELD_SIZES = [
  { size: 'small', chance: 0.25, multiplier: 0.8 },
  { size: 'regular', chance: 0.6, multiplier: 1 },
  { size: 'big', chance: 0.15, multiplier: 1.5 },
] as const;

/** Harvesting within this window after ripening pays the fresh bonus. */
export const FRESH_WINDOW_MS = 5_000;
export const FRESH_BONUS = 0.25;
/** Each extra plant in one swipe adds this share of the swipe's total, up to the cap. */
export const COMBO_STEP = 0.2;
export const COMBO_CAP = 0.8;
/** Watering cuts the remaining growth time by this share. */
export const WATER_SPEEDUP = 0.3;
