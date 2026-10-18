import type { Command, GardenState, StepResult } from './types';
import { plant } from '../plants/plant';

function assertTimestamp(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Timestamp must be a nonnegative safe integer');
  }
}

/** Advance the canonical simulation clock, then apply supported commands in order. */
export function step(
  state: GardenState,
  commands: readonly Command[],
  nowMs: number,
): StepResult {
  assertTimestamp(nowMs);
  const effectiveNowMs = Math.max(state.lastNowMs, nowMs);
  let nextState = effectiveNowMs === state.lastNowMs
    ? state
    : { ...state, lastNowMs: effectiveNowMs };
  const events: StepResult['events'][number][] = [];

  for (const command of commands) {
    if (command.type !== 'Plant') continue;

    const result = plant(nextState, command, effectiveNowMs);
    nextState = result.state;
    events.push(...result.events);
  }

  return { state: nextState, events };
}
