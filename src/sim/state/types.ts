export type SpeciesId = 'sunny-sprout' | 'bubble-berry' | 'twistroot';
export type PlotId = string;
export type GrowthStage = 'Seed' | 'Sprout' | 'Growing' | 'Mature' | 'Harvestable';

export interface PlantState {
  readonly speciesId: SpeciesId;
  readonly plantedAt: number;
}

export interface PlotState {
  readonly id: PlotId;
  readonly plant: PlantState | null;
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
  | { readonly type: 'Harvest'; readonly plotIds: readonly PlotId[] };

export type RejectionReason =
  | 'unknown-plot'
  | 'unknown-seed'
  | 'occupied'
  | 'insufficient-coins'
  | 'empty'
  | 'not-harvestable';

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
    }
  | { readonly type: 'HarvestCompleted'; readonly count: number; readonly coins: number }
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
