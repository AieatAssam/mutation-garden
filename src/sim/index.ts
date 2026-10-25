// Public simulation API. Keep this module free of browser and renderer imports.
export { SIM_SCHEMA_VERSION, createInitialState, INITIAL_COINS } from './state/initial';
export { levelForXp, xpForLevel, LEVEL_XP, CRATE_CAPACITY, crateCapacity, saleIntervalMs, SELL_INTERVAL_MS, SELLING_UPGRADES, AUTOMATION_UPGRADES, SHOP_PRICES, COMBO_CAP, COMBO_STEP, FRESH_BONUS, FRESH_WINDOW_MS, SPECIES, WATER_SPEEDUP, YIELD_SIZES } from './content/species';
export { MUTATIONS, mutationRoll } from './content/mutations';
export { ORDER_DECK, getOrderSnapshot, nextOrder, orderEventCount } from './content/orders';
export { MAX_LAB_SPECIMENS, MAX_LAB_SEEDS } from './content/laboratory';
export type { OrderDefinition } from './content/orders';
export type { GrowthStageDefinition, SpeciesDefinition } from './content/species';
export { nextRandom } from './state/rng';
export { step } from './state/step';
export { growthStart } from './state/types';
export { getSnapshot } from './state/snapshot';
export { getGrowthView } from './plants/growth';
export type {
  Command,
  Fruit,
  LabSpecimen,
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
  YieldSize,
  TraitId,
  ShopItemId,
  OrderProgress,
  OrderSnapshot,
  MutationProgress,
} from './state/types';
