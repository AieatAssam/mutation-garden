import type { GardenState, PlotState } from './types';
import { INITIAL_COINS } from '../content/species';

export const SIM_SCHEMA_VERSION = 2;
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

  return {
    schema: SIM_SCHEMA_VERSION,
    coins: INITIAL_COINS,
    lastNowMs: nowMs,
    rngState: seed >>> 0,
    xp: options.xp ?? 0,
    plots,
  };
}
