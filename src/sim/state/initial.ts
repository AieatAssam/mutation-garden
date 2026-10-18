import type { GardenState, PlotState } from './types';

export const SIM_SCHEMA_VERSION = 1;
export const INITIAL_COINS = 12;

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

export function createInitialState(seed: number, nowMs: number): GardenState {
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
    plots,
  };
}
