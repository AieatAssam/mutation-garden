import { getSnapshot, step } from '../sim';
import type { Command, GardenSnapshot, GardenState, SimEvent } from '../sim';

export const SIM_DT_MS = 100;
export const MAX_FRAME_DELTA_MS = 250;

export interface RenderFrame {
  readonly previous: GardenSnapshot;
  readonly current: GardenSnapshot;
  readonly alpha: number;
}

export interface FixedStepLoopOptions {
  readonly initialState: GardenState;
  readonly nowMs: () => number;
  readonly requestFrame: (callback: (timestampMs: number) => void) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly onRender: (frame: RenderFrame) => void;
  readonly onEvents?: (events: readonly SimEvent[], nowMs: number) => void;
}

export interface FixedStepLoop {
  enqueue(command: Command): void;
  catchUp(): void;
  start(): void;
  stop(): void;
}

function copyCommand(command: Command): Command {
  return command.type === 'Plant'
    ? { ...command }
    : { ...command, plotIds: [...command.plotIds] };
}

/** Run sim commands at a fixed rate while rendering at the supplied frame rate. */
export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop {
  let state = options.initialState;
  let previous = getSnapshot(state);
  let current = previous;
  let accumulatorMs = 0;
  let lastFrameTimestampMs: number | null = null;
  let running = false;
  let frameHandle: number | null = null;
  const commandQueue: Command[] = [];

  const tick = (nowMs: number) => {
    const commands = commandQueue.splice(0, commandQueue.length);
    const result = step(state, commands, nowMs);
    state = result.state;
    current = getSnapshot(state);
    if (result.events.length > 0) options.onEvents?.(result.events, current.nowMs);
    return result;
  };

  const scheduleFrame = () => {
    if (running && frameHandle === null) {
      frameHandle = options.requestFrame(onFrame);
    }
  };

  const onFrame = (timestampMs: number) => {
    frameHandle = null;
    if (!running) return;

    if (lastFrameTimestampMs === null) {
      lastFrameTimestampMs = timestampMs;
    } else {
      const elapsedMs = Math.max(0, timestampMs - lastFrameTimestampMs);
      const frameDeltaMs = Math.min(elapsedMs, MAX_FRAME_DELTA_MS);
      lastFrameTimestampMs = timestampMs;
      accumulatorMs += frameDeltaMs;

      while (accumulatorMs >= SIM_DT_MS) {
        previous = current;
        tick(options.nowMs());
        accumulatorMs -= SIM_DT_MS;
      }
    }

    options.onRender({
      previous,
      current,
      alpha: accumulatorMs / SIM_DT_MS,
    });
    scheduleFrame();
  };

  return {
    enqueue(command) {
      commandQueue.push(copyCommand(command));
    },
    catchUp() {
      tick(options.nowMs());
      previous = current;
      accumulatorMs = 0;
      lastFrameTimestampMs = null;
      options.onRender({ previous, current, alpha: 0 });
    },
    start() {
      if (running) return;
      running = true;
      accumulatorMs = 0;
      lastFrameTimestampMs = null;
      scheduleFrame();
    },
    stop() {
      if (!running) return;
      running = false;
      lastFrameTimestampMs = null;
      accumulatorMs = 0;
      if (frameHandle !== null) {
        options.cancelFrame(frameHandle);
        frameHandle = null;
      }
    },
  };
}
