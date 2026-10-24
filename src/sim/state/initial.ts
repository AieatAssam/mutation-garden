import type { GardenState, PlotState, TraitId } from './types';
import { INITIAL_COINS } from '../content/species';

export const SIM_SCHEMA_VERSION = 5;
export { INITIAL_COINS };

function assertTimestamp(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Timestamp must be a nonnegative safe integer');
  }
}

function assertSeed(seed: number): void {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('Seed must be a safe integer');
  }
}

export interface InitialStateOptions {
  /** Starting XP, for sandbox or test gardens that begin with later seeds unlocked. */
  readonly xp?: number;
}

export function createInitialState(seed: number, nowMs: number, options: InitialStateOptions = {}): GardenState {
  assertSeed(seed);
  assertTimestamp(nowMs);

  const plots: PlotState[] = Array.from({ length: 6 }, (_, index) => ({
    id: `plot-${index}`,
    plant: null,
  }));

  const seedHash = hash32(seed >>> 0);
  return {
    schema: SIM_SCHEMA_VERSION,
    coins: INITIAL_COINS,
    lastNowMs: nowMs,
    rngState: seed >>> 0,
    mutationRngState: seedHash === (seed >>> 0) ? (seedHash ^ 0x9e3779b9) >>> 0 : seedHash,
    scriptedGiantUsed: false,
    scriptedGoldenUsed: false,
    plantCount: 0,
    badLuck: { giant: 0, golden: 0, glowing: 0, crystal: 0, rainbow: 0 } satisfies Record<TraitId, number>,
    discoveries: [],
    rewardsPaid: [],
    owned: [],
    fertiliser: 0,
    xp: options.xp ?? 0,
    crate: [],
    sellingSince: null,
    order: { index: 0, progress: 0 },
    plots,
  };
}

export function hash32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
