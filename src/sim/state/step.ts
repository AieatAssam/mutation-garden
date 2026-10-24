import type { Command, GardenState, StepResult } from './types';
import { plant } from '../plants/plant';
import { harvest } from '../plants/harvest';
import { water } from '../plants/water';
import { collectGrowthEvents } from '../plants/growth';
import { evaluateMature } from '../plants/mutate';
import { buy, waterAll } from '../plants/shop';

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
  const events: StepResult['events'][number][] = [
    ...collectGrowthEvents(state, state.lastNowMs, effectiveNowMs),
  ];
  let nextState = effectiveNowMs === state.lastNowMs
    ? state
    : { ...state, lastNowMs: effectiveNowMs };

  if (commands.some((command) => command.type === 'Harvest')) {
    const mature = evaluateMature(nextState, effectiveNowMs);
    nextState = mature.state;
    events.push(...mature.events);
  }

  for (const command of commands) {
    const result = command.type === 'Plant'
      ? plant(nextState, command, effectiveNowMs)
      : command.type === 'Water'
        ? water(nextState, command, effectiveNowMs)
        : command.type === 'Harvest'
          ? harvest(nextState, command, effectiveNowMs)
          : command.type === 'Buy'
            ? buy(nextState, command)
            : waterAll(nextState, effectiveNowMs);
    nextState = result.state;
    events.push(...result.events);
  }

  const mutationResult = evaluateMature(nextState, effectiveNowMs);
  nextState = mutationResult.state;
  events.push(...mutationResult.events);

  return { state: nextState, events };
}
