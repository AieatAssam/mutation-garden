export type SpeciesId = 'sunny-sprout' | 'bubble-berry' | 'twistroot' | 'puffcap';
export type PlotId = string;
export type ShopItemId = 'plot-6' | 'plot-7' | 'big-can' | 'fertiliser' | 'lucky-charm';
export type GrowthStage = 'Seed' | 'Sprout' | 'Growing' | 'Mature' | 'Harvestable';

/** Fruit size rolled at planting (design.md 4.3). Absent means regular. */
export type YieldSize = 'small' | 'regular' | 'big';
export type TraitId = 'giant' | 'golden' | 'glowing' | 'crystal' | 'rainbow';

export interface PlantState {
  readonly speciesId: SpeciesId;
  /** When the seed went in. Stable for the plant's life, so presentation can use it as identity. */
  readonly plantedAt: number;
  readonly size?: YieldSize;
  /** Growth time skipped by watering; growth runs from plantedAt - boostMs. */
  readonly boostMs?: number;
  readonly mutationSeed: number;
  readonly waterCount?: number;
  readonly mutations?: readonly TraitId[];
  readonly scriptedGiant?: boolean;
  readonly fertilised?: boolean;
}

/** The timestamp growth is measured from. */
export function growthStart(plant: PlantState): number {
  return plant.plantedAt - (plant.boostMs ?? 0);
}

export interface GrowthView {
  readonly stage: GrowthStage;
  readonly progress: number;
}

export interface PlantSnapshot extends Omit<PlantState, 'mutationSeed' | 'scriptedGiant'>, GrowthView { readonly tell?: TraitId | null }

export interface PlotState {
  readonly id: PlotId;
  readonly plant: PlantState | null;
}

export interface PlotSnapshot {
  readonly id: PlotId;
  readonly plant: PlantSnapshot | null;
}

export interface GardenSnapshot {
  readonly coins: number;
  readonly xp: number;
  readonly level: number;
  /** XP at which the current level started and the next one begins. */
  readonly levelStartXp: number;
  readonly nextLevelXp: number;
  readonly nowMs: number;
  readonly plantCount?: number;
  readonly scriptedGiantUsed?: boolean;
  readonly scriptedGoldenUsed?: boolean;
  readonly plots: readonly PlotSnapshot[];
  readonly nearMiss?: string | null;
  readonly owned?: readonly ShopItemId[];
  readonly fertiliser?: number;
  readonly crate?: readonly Fruit[];
  readonly crateCount?: number;
  readonly crateCapacity?: 12;
  readonly selling?: boolean;
  readonly nextSaleTime?: number | null;
}

export interface GardenState {
  readonly schema: 4;
  readonly coins: number;
  readonly lastNowMs: number;
  readonly rngState: number;
  readonly mutationRngState: number;
  readonly scriptedGiantUsed: boolean;
  readonly scriptedGoldenUsed: boolean;
  readonly plantCount: number;
  readonly badLuck: Readonly<Record<TraitId, number>>;
  readonly discoveries: readonly string[];
  readonly rewardsPaid: readonly string[];
  readonly owned: readonly ShopItemId[];
  readonly fertiliser: number;
  /** Garden XP; the level is derived from it (design.md 4.4). */
  readonly xp: number;
  readonly crate: readonly Fruit[];
  readonly sellingSince: number | null;
  readonly plots: readonly PlotState[];
}

export interface Fruit { readonly speciesId: SpeciesId; readonly size: YieldSize; readonly mutations: readonly TraitId[]; readonly value: number; readonly xp: number }

export type Command =
  | { readonly type: 'Plant'; readonly plotId: PlotId; readonly seedId: SpeciesId }
  | { readonly type: 'Harvest'; readonly plotIds: readonly PlotId[] }
  | { readonly type: 'Water'; readonly plotId: PlotId }
  | { readonly type: 'WaterAll' }
  | { readonly type: 'Buy'; readonly item: ShopItemId }
  | { readonly type: 'StartSelling' };

export type RejectionReason =
  | 'unknown-plot'
  | 'unknown-seed'
  | 'occupied'
  | 'insufficient-coins'
  | 'empty'
  | 'not-harvestable'
  | 'not-growing'
  | 'too-early'
  | 'already-watered'
  | 'locked'
  | 'owned'
  | 'crate-full';

export type SimEvent =
  | { readonly type: 'Planted'; readonly plotId: PlotId; readonly speciesId: SpeciesId }
  | {
      readonly type: 'StageReached';
      readonly plotId: PlotId;
      readonly stage: 'Sprout' | 'Growing' | 'Mature';
    }
  | { readonly type: 'Harvestable'; readonly plotId: PlotId }
  | {
      readonly type: 'Harvested';
      readonly plotId: PlotId;
      readonly speciesId: SpeciesId;
      readonly coins: number;
      readonly size: YieldSize;
      /** Harvested within the fresh window after ripening. */
      readonly fresh: boolean;
      readonly lucky: boolean;
      readonly mutations?: readonly TraitId[];
    }
  | {
      readonly type: 'HarvestCompleted';
      readonly count: number;
      /** Always zero: fruit is paid when sold. */
      readonly coins: number;
      readonly comboBonus: number;
    }
  | { readonly type: 'LuckyHarvest'; readonly plotId: PlotId }
  | { readonly type: 'Watered'; readonly plotId: PlotId }
  | { readonly type: 'Mutated'; readonly plotId: PlotId; readonly speciesId: SpeciesId; readonly mutations: readonly TraitId[]; readonly firstDiscovery: boolean; readonly bonusCoins: number }
  | { readonly type: 'Bought'; readonly item: ShopItemId }
  | { readonly type: 'FruitSold'; readonly value: number; readonly speciesId: SpeciesId; readonly mutations: readonly TraitId[] }
  | { readonly type: 'LevelUp'; readonly level: number; readonly unlocked: readonly SpeciesId[] }
  | {
      readonly type: 'CommandRejected';
      readonly command: Command['type'];
      readonly plotId: PlotId;
      readonly reason: RejectionReason;
    };

export interface StepResult {
  readonly state: GardenState;
  readonly events: readonly SimEvent[];
}
