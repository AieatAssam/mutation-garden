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
    seedCost: 4,
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

export const SHOP_PRICES = { 'plot-6': 80, 'plot-7': 220, 'big-can': 90, fertiliser: 30, 'lucky-charm': 300, 'quick-counter-1': 45, 'quick-counter-2': 180, 'quick-counter-3': 600, 'crate-1': 70, 'crate-2': 300, 'second-counter': 350, 'fresh-produce': 160, sprinkler: 80, 'sprinkler-2': 160, 'sprinkler-3': 360, 'bee-hive': 140, 'bee-hive-2': 260, 'bee-hive-3': 520, 'seed-hopper': 220, 'seed-hopper-2': 400, 'seed-hopper-3': 800, 'harvest-helper': 420, 'harvest-helper-2': 700, 'harvest-helper-3': 1_100, 'delivery-cart': 1_200, 'delivery-cart-2': 1_000, 'delivery-cart-3': 1_800 } as const;
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

export const AUTOMATION_UPGRADES = [
  { id: 'sprinkler', title: 'Sprinkler', desc: 'Water the centre plot once.', price: SHOP_PRICES.sprinkler, level: 5 },
  { id: 'sprinkler-2', title: 'Sprinkler II', desc: 'Water growing plants twice for Giant.', price: SHOP_PRICES['sprinkler-2'], level: 7, requires: 'sprinkler' },
  { id: 'sprinkler-3', title: 'Sprinkler III', desc: 'Reach plots beside the centre.', price: SHOP_PRICES['sprinkler-3'], level: 9, requires: 'sprinkler-2' },
  { id: 'bee-hive', title: 'Bee hive', desc: 'Visit growing plants beside plot 2.', price: SHOP_PRICES['bee-hive'], level: 7 },
  { id: 'bee-hive-2', title: 'Bee hive II', desc: 'Add 10 points to non-guaranteed rule chances.', price: SHOP_PRICES['bee-hive-2'], level: 9, requires: 'bee-hive' },
  { id: 'bee-hive-3', title: 'Bee hive III', desc: 'Visit plants beside two flower plots.', price: SHOP_PRICES['bee-hive-3'], level: 11, requires: 'bee-hive-2' },
  { id: 'seed-hopper', title: 'Seed hopper', desc: 'Replant harvested plots with their last seed.', price: SHOP_PRICES['seed-hopper'], level: 8 },
  { id: 'seed-hopper-2', title: 'Seed hopper II', desc: 'Plant empty plots first.', price: SHOP_PRICES['seed-hopper-2'], level: 10, requires: 'seed-hopper' },
  { id: 'seed-hopper-3', title: 'Seed hopper III', desc: 'Plant every eligible plot.', price: SHOP_PRICES['seed-hopper-3'], level: 12, requires: 'seed-hopper-2' },
  { id: 'harvest-helper', title: 'Harvest helper', desc: 'Harvest ripe plants into the crate.', price: SHOP_PRICES['harvest-helper'], level: 10 },
  { id: 'harvest-helper-2', title: 'Harvest helper II', desc: 'Walk to ripe plants faster.', price: SHOP_PRICES['harvest-helper-2'], level: 12, requires: 'harvest-helper' },
  { id: 'harvest-helper-3', title: 'Harvest helper III', desc: 'Carry two fruit at a time.', price: SHOP_PRICES['harvest-helper-3'], level: 14, requires: 'harvest-helper-2' },
  { id: 'delivery-cart', title: 'Delivery cart', desc: 'Send crate fruit to the stall.', price: SHOP_PRICES['delivery-cart'], level: 12 },
  { id: 'delivery-cart-2', title: 'Delivery cart II', desc: 'Double cart speed.', price: SHOP_PRICES['delivery-cart-2'], level: 14, requires: 'delivery-cart' },
  { id: 'delivery-cart-3', title: 'Delivery cart III', desc: 'Add a second trip each cycle.', price: SHOP_PRICES['delivery-cart-3'], level: 16, requires: 'delivery-cart-2' },
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
