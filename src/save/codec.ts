import { SIM_SCHEMA_VERSION, SPECIES } from '../sim';
import type { GardenState } from '../sim';

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
};

const SPECIES_IDS = new Set<string>(SPECIES.map(({ id }) => id));
const SIZES = new Set(['small', 'regular', 'big']);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Structural check of a migrated state; anything unexpected is rejected rather than half-loaded. */
export function validateState(value: unknown): value is GardenState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (state.schema !== SIM_SCHEMA_VERSION || !isCount(state.coins) || !isCount(state.lastNowMs)) return false;
  if (!Number.isInteger(state.rngState) || (state.rngState as number) < 0 || (state.rngState as number) > 0xffff_ffff) return false;
  if (!isCount(state.xp)) return false;
  if (!Array.isArray(state.plots) || state.plots.length === 0) return false;
  return state.plots.every((plot: unknown) => {
    if (!plot || typeof plot !== 'object') return false;
    const { id, plant } = plot as Record<string, unknown>;
    if (typeof id !== 'string') return false;
    if (plant === null) return true;
    if (!plant || typeof plant !== 'object') return false;
    const { speciesId, plantedAt, size, boostMs } = plant as Record<string, unknown>;
    return typeof speciesId === 'string' && SPECIES_IDS.has(speciesId) && isCount(plantedAt)
      && (size === undefined || (typeof size === 'string' && SIZES.has(size)))
      && (boostMs === undefined || isCount(boostMs));
  });
}

export function decodeSave(raw: unknown): DecodeResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const envelope = raw as Partial<SaveEnvelope>;
  if (!Number.isSafeInteger(envelope.schema) || !envelope.state || typeof envelope.checksum !== 'string') {
    return { ok: false, reason: 'missing fields' };
  }
  if (checksum(JSON.stringify(envelope.state)) !== envelope.checksum) return { ok: false, reason: 'checksum mismatch' };
  if (envelope.schema! > SIM_SCHEMA_VERSION) return { ok: false, reason: 'save is from a newer version' };
  let state = envelope.state as unknown as Record<string, unknown>;
  for (let schema = envelope.schema!; schema < SIM_SCHEMA_VERSION; schema += 1) {
    const migrate = MIGRATIONS[schema];
    if (!migrate) return { ok: false, reason: `no migration from schema ${schema}` };
    state = migrate(state);
  }
  if (!validateState(state)) return { ok: false, reason: 'invalid state' };
  return { ok: true, state, savedAt: Number.isSafeInteger(envelope.savedAt) ? envelope.savedAt! : 0 };
}
