import { crateCapacity, levelForXp, MAX_LAB_SPECIMENS, ORDER_DECK, SIM_SCHEMA_VERSION, SPECIES } from '../sim';
import type { GardenState, TraitId } from '../sim';

/** The stored and exported save format (docs/architecture.md, Saves). Keep it stable. */
export interface SaveEnvelope {
  readonly schema: number;
  readonly savedAt: number;
  readonly appVersion: string;
  readonly checksum: string;
  readonly state: GardenState;
}

export type DecodeResult =
  | { readonly ok: true; readonly state: GardenState; readonly savedAt: number }
  | { readonly ok: false; readonly reason: string };

/** FNV-1a over the JSON text: catches truncated or hand-edited saves, not an attacker. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function encodeSave(state: GardenState, savedAt: number, appVersion: string): SaveEnvelope {
  return { schema: state.schema, savedAt, appVersion, checksum: checksum(JSON.stringify(state)), state };
}

/** migrations[n] turns a schema-n state into schema n+1. Never delete one; each has a fixture test. */
export const MIGRATIONS: Readonly<Record<number, (state: Record<string, unknown>) => Record<string, unknown>>> = {
  // Schema 2 adds garden XP (M1-S4).
  1: (state) => ({ ...state, schema: 2, xp: 0 }),
  2: (state) => ({ ...state, schema: 3, mutationRngState: 0, scriptedGiantUsed: false,
    badLuck: { giant: 0, golden: 0, glowing: 0, crystal: 0, rainbow: 0 }, discoveries: [], rewardsPaid: [],
    owned: [], fertiliser: 0,
    plantCount: Array.isArray(state.plots) ? state.plots.filter((plot) => Boolean(plot && typeof plot === 'object' && (plot as Record<string, unknown>).plant)).length : 0,
    scriptedGoldenUsed: false,
    plots: Array.isArray(state.plots) ? state.plots.map((plot) => {
      if (!plot || typeof plot !== 'object') return plot;
      const entry = plot as Record<string, unknown>;
      if (!entry.plant || typeof entry.plant !== 'object') return entry;
      const plant = entry.plant as Record<string, unknown>;
      return { ...entry, plant: { ...plant, mutationSeed: 0xffff_ffff, ...(plant.boostMs === undefined ? {} : { waterCount: 1 }) } };
    }) : state.plots,
  }),
  3: (state) => ({ ...state, schema: 4, crate: [], sellingSince: null }),
  4: (state) => ({ ...state, schema: 5, order: { index: 0, progress: 0 } }),
  5: (state) => ({ ...state, schema: 6, crystalReadyPlots: [], rainbowPlots: [] }),
  6: (state) => ({ ...state, schema: 7 }),
  7: (state) => ({ ...state, schema: 8, plots: Array.isArray(state.plots) ? state.plots.map((plot) => {
    if (!plot || typeof plot !== 'object') return plot;
    const item = plot as Record<string, unknown>;
    const plant = item.plant as Record<string, unknown> | null;
    return { ...item, ...(typeof plant?.speciesId === 'string' ? { lastSeedId: plant.speciesId } : {}) };
  }) : state.plots }),
  8: (state) => ({ ...state, schema: 9, bonusSeeds: 0 }),
  9: (state) => ({ ...state, schema: 10, labSpecimens: [], nextLabSpecimenId: 0 }),
};

const SPECIES_IDS = new Set<string>(SPECIES.map(({ id }) => id));
const SIZES = new Set(['small', 'regular', 'big']);
const SHOP_ITEM_IDS = new Set(['plot-6', 'plot-7', 'big-can', 'lucky-charm', 'quick-counter-1', 'quick-counter-2', 'quick-counter-3', 'crate-1', 'crate-2', 'second-counter', 'fresh-produce', 'sprinkler', 'sprinkler-2', 'sprinkler-3', 'bee-hive', 'bee-hive-2', 'bee-hive-3', 'seed-hopper', 'seed-hopper-2', 'seed-hopper-3', 'harvest-helper', 'harvest-helper-2', 'harvest-helper-3', 'delivery-cart', 'delivery-cart-2', 'delivery-cart-3']);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Structural check of a migrated state; anything unexpected is rejected rather than half-loaded. */
export function validateState(value: unknown): value is GardenState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (state.schema !== SIM_SCHEMA_VERSION || !isCount(state.coins) || !isCount(state.bonusSeeds) || !isCount(state.lastNowMs)) return false;
  if (!Number.isInteger(state.rngState) || (state.rngState as number) < 0 || (state.rngState as number) > 0xffff_ffff) return false;
  if (!isCount(state.xp)) return false;
  const validFruit = (fruit: unknown): boolean => {
    if (!fruit || typeof fruit !== 'object') return false;
    const item = fruit as Record<string, unknown>;
    const traits: TraitId[] = ['giant', 'golden', 'glowing', 'crystal', 'rainbow', 'frozen', 'electric', 'twin'];
    return SPECIES_IDS.has(item.speciesId as string) && SIZES.has(item.size as string)
      && isCount(item.value) && isCount(item.xp) && Array.isArray(item.mutations)
      && new Set(item.mutations).size === item.mutations.length && item.mutations.every((trait) => traits.includes(trait as TraitId));
  };
  if (!Array.isArray(state.labSpecimens) || state.labSpecimens.length > MAX_LAB_SPECIMENS
    || !isCount(state.nextLabSpecimenId)) return false;
  const specimenIds = state.labSpecimens.map((specimen) => specimen && typeof specimen === 'object'
    ? (specimen as Record<string, unknown>).id : undefined);
  if (specimenIds.some((id) => !isCount(id)) || new Set(specimenIds).size !== specimenIds.length
    || (specimenIds.length > 0 && (state.nextLabSpecimenId as number) <= Math.max(...specimenIds as number[]))) return false;
  if (!state.labSpecimens.every((specimen) => specimen && typeof specimen === 'object'
    && validFruit((specimen as Record<string, unknown>).fruit))) return false;
  if (!Array.isArray(state.owned) || !state.owned.every((item) => SHOP_ITEM_IDS.has(item as string))
    || new Set(state.owned).size !== state.owned.length) return false;
  if (!Array.isArray(state.crate) || state.crate.length > crateCapacity(state.owned as GardenState['owned']) || !state.crate.every(validFruit)
    || !(state.sellingSince === null || (isCount(state.sellingSince) && state.sellingSince <= (state.lastNowMs as number)))) return false;
  if (!Number.isInteger(state.mutationRngState) || (state.mutationRngState as number) < 0 || (state.mutationRngState as number) > 0xffff_ffff) return false;
  if (!isCount(state.plantCount) || !isCount(state.fertiliser) || typeof state.scriptedGiantUsed !== 'boolean' || typeof state.scriptedGoldenUsed !== 'boolean' || !Array.isArray(state.discoveries) || !state.discoveries.every((item) => typeof item === 'string') || !Array.isArray(state.rewardsPaid) || !state.rewardsPaid.every((item) => typeof item === 'string') || !Array.isArray(state.crystalReadyPlots) || !state.crystalReadyPlots.every((id) => typeof id === 'string') || new Set(state.crystalReadyPlots).size !== state.crystalReadyPlots.length || !Array.isArray(state.rainbowPlots) || !state.rainbowPlots.every((id) => typeof id === 'string') || new Set(state.rainbowPlots).size !== state.rainbowPlots.length) return false;
  if (!state.order || typeof state.order !== 'object' || Array.isArray(state.order)) return false;
  const order = state.order as Record<string, unknown>;
  if (Object.keys(order).sort().join(',') !== 'index,progress' || !isCount(order.index) || !isCount(order.progress) || order.index >= ORDER_DECK.length) return false;
  const activeOrder = ORDER_DECK[order.index]!;
  if (order.progress >= activeOrder.target || (activeOrder.event === 'HarvestCompleted' && order.progress !== 0)
    || activeOrder.unlockLevel > levelForXp(state.xp as number)) return false;
  const legacyTraits: TraitId[] = ['giant', 'golden', 'glowing', 'crystal', 'rainbow'];
  if (!state.badLuck || typeof state.badLuck !== 'object' || !legacyTraits.every((trait) => isCount((state.badLuck as Record<string, unknown>)[trait]))) return false;
  const traits: TraitId[] = [...legacyTraits, 'frozen', 'electric', 'twin'];
  if (!Array.isArray(state.plots) || state.plots.length === 0) return false;
  return state.plots.every((plot: unknown) => {
    if (!plot || typeof plot !== 'object') return false;
    const { id, plant } = plot as Record<string, unknown>;
    if (typeof id !== 'string' || (plot as Record<string, unknown>).lastSeedId !== undefined && !SPECIES_IDS.has((plot as Record<string, unknown>).lastSeedId as string)) return false;
    if (plant === null) return true;
    if (!plant || typeof plant !== 'object') return false;
    const { speciesId, plantedAt, size, boostMs, clockBoostMs, mutationSeed, waterCount, mutations, scriptedGiant, rainbow } = plant as Record<string, unknown>;
    return typeof speciesId === 'string' && SPECIES_IDS.has(speciesId) && isCount(plantedAt)
      && Number.isInteger(mutationSeed) && (mutationSeed as number) >= 0 && (mutationSeed as number) <= 0xffff_ffff
      && (waterCount === undefined || isCount(waterCount))
      && (waterCount === undefined || (waterCount as number) <= 2)
      && (mutations === undefined || (Array.isArray(mutations) && mutations.length <= traits.length && new Set(mutations).size === mutations.length && mutations.every((trait) => traits.includes(trait as TraitId))))
      && (scriptedGiant === undefined || typeof scriptedGiant === 'boolean')
      && (rainbow === undefined || typeof rainbow === 'boolean')
      && ((plant as Record<string, unknown>).dewUsed === undefined || typeof (plant as Record<string, unknown>).dewUsed === 'boolean')
      && ((plant as Record<string, unknown>).sprinklerWaterCount === undefined || (isCount((plant as Record<string, unknown>).sprinklerWaterCount) && ((plant as Record<string, unknown>).sprinklerWaterCount as number) <= 2))
      && ((plant as Record<string, unknown>).beeVisited === undefined || typeof (plant as Record<string, unknown>).beeVisited === 'boolean')
      && ((plant as Record<string, unknown>).twinReady === undefined || typeof (plant as Record<string, unknown>).twinReady === 'boolean')
      && ((plant as Record<string, unknown>).clockBoostedBy === undefined || (Array.isArray((plant as Record<string, unknown>).clockBoostedBy)
        && new Set((plant as Record<string, unknown>).clockBoostedBy as unknown[]).size === ((plant as Record<string, unknown>).clockBoostedBy as unknown[]).length
        && ((plant as Record<string, unknown>).clockBoostedBy as unknown[]).every((id) => typeof id === 'string')))
      && (size === undefined || (typeof size === 'string' && SIZES.has(size)))
      && (boostMs === undefined || isCount(boostMs))
      && (clockBoostMs === undefined || isCount(clockBoostMs));
  });
}

export const NEWER_REASON = 'save is from a newer version';

export function decodeSave(raw: unknown): DecodeResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const envelope = raw as Partial<SaveEnvelope>;
  if (!Number.isSafeInteger(envelope.schema) || !envelope.state || typeof envelope.checksum !== 'string') {
    return { ok: false, reason: 'missing fields' };
  }
  if (checksum(JSON.stringify(envelope.state)) !== envelope.checksum) return { ok: false, reason: 'checksum mismatch' };
  if (envelope.schema! > SIM_SCHEMA_VERSION) return { ok: false, reason: NEWER_REASON };
  let state = envelope.state as unknown as Record<string, unknown>;
  for (let schema = envelope.schema!; schema < SIM_SCHEMA_VERSION; schema += 1) {
    const migrate = MIGRATIONS[schema];
    if (!migrate) return { ok: false, reason: `no migration from schema ${schema}` };
    state = migrate(state);
  }
  if (!validateState(state)) return { ok: false, reason: 'invalid state' };
  return { ok: true, state, savedAt: Number.isSafeInteger(envelope.savedAt) ? envelope.savedAt! : 0 };
}
