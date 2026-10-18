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
