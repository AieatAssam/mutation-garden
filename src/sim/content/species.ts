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
  readonly stages: readonly GrowthStageDefinition[];
}

export const SPECIES = [
  {
    id: 'sunny-sprout',
    name: 'Sunny Sprout',
    seedCost: 1,
    baseValue: 2,
    growthDurationMs: 8000,
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
    stages: [
      { stage: 'Seed', startsAtMs: 0 },
      { stage: 'Sprout', startsAtMs: 3000 },
      { stage: 'Growing', startsAtMs: 10000 },
      { stage: 'Mature', startsAtMs: 22000 },
      { stage: 'Harvestable', startsAtMs: 25000 },
    ],
  },
] as const satisfies readonly SpeciesDefinition[];

export const INITIAL_COINS = 12;

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
export const COMBO_STEP = 0.1;
export const COMBO_CAP = 0.5;
/** Watering cuts the remaining growth time by this share. */
export const WATER_SPEEDUP = 0.3;
