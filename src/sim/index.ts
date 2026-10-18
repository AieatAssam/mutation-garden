// Public simulation API. Keep this module free of browser and renderer imports.
export { SIM_SCHEMA_VERSION, createInitialState, INITIAL_COINS } from './state/initial';
export { SPECIES } from './content/species';
export type { GrowthStageDefinition, SpeciesDefinition } from './content/species';
export { nextRandom } from './state/rng';
export { step } from './state/step';
export { getSnapshot } from './state/snapshot';
export { getGrowthView } from './plants/growth';
export type {
  Command,
  GardenState,
  GardenSnapshot,
  GrowthView,
  GrowthStage,
  PlantState,
  PlantSnapshot,
  PlotSnapshot,
  PlotId,
  PlotState,
  RejectionReason,
  SimEvent,
  SpeciesId,
  StepResult,
} from './state/types';
