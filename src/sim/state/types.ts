export type SpeciesId = 'sunny-sprout' | 'bubble-berry' | 'twistroot';
export type PlotId = string;
export type GrowthStage = 'Seed' | 'Sprout' | 'Growing' | 'Mature' | 'Harvestable';

/** Fruit size rolled at planting (design.md 4.3). Absent means regular. */
export type YieldSize = 'small' | 'regular' | 'big';

export interface PlantState {
  readonly speciesId: SpeciesId;
  /** When the seed went in. Stable for the plant's life, so presentation can use it as identity. */
  readonly plantedAt: number;
  readonly size?: YieldSize;
  /** Growth time skipped by watering; growth runs from plantedAt - boostMs. */
  readonly boostMs?: number;
}

/** The timestamp growth is measured from. */
export function growthStart(plant: PlantState): number {
  return plant.plantedAt - (plant.boostMs ?? 0);
}

export interface GrowthView {
  readonly stage: GrowthStage;
  readonly progress: number;
}

export interface PlantSnapshot extends PlantState, GrowthView {}

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
  readonly nowMs: number;
  readonly plots: readonly PlotSnapshot[];
}

export interface GardenState {
  readonly schema: 1;
  readonly coins: number;
  readonly lastNowMs: number;
  readonly rngState: number;
  readonly plots: readonly PlotState[];
}

export type Command =
  | { readonly type: 'Plant'; readonly plotId: PlotId; readonly seedId: SpeciesId }
  | { readonly type: 'Harvest'; readonly plotIds: readonly PlotId[] }
  | { readonly type: 'Water'; readonly plotId: PlotId };

export type RejectionReason =
  | 'unknown-plot'
  | 'unknown-seed'
  | 'occupied'
  | 'insufficient-coins'
  | 'empty'
  | 'not-harvestable'
  | 'not-growing'
  | 'already-watered';

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
    }
  | {
      readonly type: 'HarvestCompleted';
      readonly count: number;
      /** Total paid, including the combo bonus. */
      readonly coins: number;
      readonly comboBonus: number;
    }
  | { readonly type: 'Watered'; readonly plotId: PlotId }
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
