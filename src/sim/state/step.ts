import type { Command, GardenState, StepResult } from './types';

function assertTimestamp(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Timestamp must be a nonnegative safe integer');
  }
}

/** Advance the canonical simulation clock and apply no gameplay until handlers are added. */
export function step(
  state: GardenState,
  _commands: readonly Command[],
  nowMs: number,
): StepResult {
  assertTimestamp(nowMs);
  const effectiveNowMs = Math.max(state.lastNowMs, nowMs);
  const nextState = effectiveNowMs === state.lastNowMs
    ? state
    : { ...state, lastNowMs: effectiveNowMs };

  return { state: nextState, events: [] };
}
