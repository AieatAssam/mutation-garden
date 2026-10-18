// Public simulation API. Keep this module free of browser and renderer imports.
export { SIM_SCHEMA_VERSION, createInitialState, INITIAL_COINS } from './state/initial';
export { nextRandom } from './state/rng';
export { step } from './state/step';
export type {
  Command,
  GardenState,
  GrowthStage,
  PlantState,
  PlotId,
  PlotState,
  RejectionReason,
  SimEvent,
  SpeciesId,
  StepResult,
} from './state/types';
