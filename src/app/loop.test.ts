import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../sim';
import type { Command, SimEvent } from '../sim';
import { createFixedStepLoop, SIM_DT_MS } from './loop';

function createHarness(nowMs: () => number = () => 1_000) {
  let nextHandle = 1;
  const callbacks = new Map<number, (timestampMs: number) => void>();
  const requestFrame = vi.fn((callback: (timestampMs: number) => void) => {
    const handle = nextHandle++;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancelFrame = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });
  const frames: Array<{ previous: number; current: number; alpha: number }> = [];
  const eventBatches: (readonly SimEvent[])[] = [];
  const loop = createFixedStepLoop({
    initialState: createInitialState(1, 0),
    nowMs,
    requestFrame,
    cancelFrame,
    onRender: ({ previous, current, alpha }) => {
      frames.push({ previous: previous.nowMs, current: current.nowMs, alpha });
    },
    onEvents: (events) => eventBatches.push([...events]),
  });

  function frame(timestampMs: number): void {
    const pending = [...callbacks.entries()];
    expect(pending).toHaveLength(1);
    const [handle, callback] = pending[0]!;
    callbacks.delete(handle);
    callback(timestampMs);
  }

  return { loop, frame, callbacks, requestFrame, cancelFrame, frames, eventBatches };
}

const plantA: Command = { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' };
const plantB: Command = { type: 'Plant', plotId: 'plot-1', seedId: 'bubble-berry' };

describe('fixed-step app loop', () => {
  it('uses the first RAF timestamp only as a baseline, without inventing a tick', () => {
    const nowMs = vi.fn(() => 5_000);
    const h = createHarness(nowMs);
    h.loop.start();

    h.frame(25_000);

    expect(nowMs).not.toHaveBeenCalled();
    expect(h.frames).toEqual([{ previous: 0, current: 0, alpha: 0 }]);
  });

  it('ticks at the 100ms boundary after 99ms plus 1ms', () => {
    const nowMs = vi.fn(() => 10_000);
    const h = createHarness(nowMs);
    h.loop.start();
    h.frame(0);
    h.frame(99);

    expect(nowMs).not.toHaveBeenCalled();
    expect(h.frames.at(-1)?.alpha).toBeCloseTo(0.99);

    h.frame(100);

    expect(nowMs).toHaveBeenCalledTimes(1);
    expect(h.frames.at(-1)).toEqual({ previous: 0, current: 10_000, alpha: 0 });
    expect(SIM_DT_MS).toBe(100);
  });

  it('renders a 150ms frame with half a tick of interpolation remaining', () => {
    const h = createHarness(() => 10_000);
    h.loop.start();
    h.frame(0);

    h.frame(150);

    expect(h.frames.at(-1)).toEqual({ previous: 0, current: 10_000, alpha: 0.5 });
  });

  it('runs at 10Hz across one second of 100ms frames', () => {
    const nowMs = vi.fn((() => {
      let tick = 0;
      return () => ++tick * SIM_DT_MS;
    })());
    const h = createHarness(nowMs);
    h.loop.start();
    h.frame(0);
    for (let timestamp = SIM_DT_MS; timestamp <= 1_000; timestamp += SIM_DT_MS) {
      h.frame(timestamp);
    }

    expect(nowMs).toHaveBeenCalledTimes(10);
    expect(h.frames.at(-1)).toEqual({ previous: 900, current: 1_000, alpha: 0 });
  });

  it('runs 10 sim ticks over one second at both 30Hz and 60Hz, rendering every frame', () => {
    const runAtRate = (framesPerSecond: 30 | 60) => {
      let tick = 0;
      const nowMs = vi.fn(() => ++tick * SIM_DT_MS);
      const h = createHarness(nowMs);
      h.loop.start();
      h.frame(0);
      for (let frameIndex = 1; frameIndex <= framesPerSecond; frameIndex += 1) {
        h.frame((frameIndex * 1_000) / framesPerSecond);
      }
      return {
        ticks: nowMs.mock.calls.length,
        renders: h.frames.length,
        alphas: h.frames.map(({ alpha }) => alpha),
      };
    };

    for (const [rate, expectedRenders] of [[30, 31], [60, 61]] as const) {
      const result = runAtRate(rate);
      expect(result.ticks).toBe(10);
      expect(result.renders).toBe(expectedRenders);
      expect(result.alphas.every((alpha) => alpha >= 0 && alpha < 1)).toBe(true);
    }
  });

  it('caps each incoming frame delta at 250ms and retains the 75ms remainder', () => {
    let wallTime = 0;
    const nowMs = vi.fn(() => wallTime += SIM_DT_MS);
    const h = createHarness(nowMs);
    h.loop.start();
    h.frame(0);

    h.frame(1_000); // Capped to 250ms: two ticks and 50ms remain.
    expect(nowMs).toHaveBeenCalledTimes(2);
    expect(h.frames.at(-1)?.alpha).toBe(0.5);

    h.frame(1_075); // 75ms plus the retained 50ms: one tick and 25ms remain.
    expect(nowMs).toHaveBeenCalledTimes(3);
    expect(h.frames.at(-1)).toEqual({ previous: 200, current: 300, alpha: 0.25 });
  });

  it('keeps commands queued until a tick, drains them once in FIFO order across catch-up ticks', () => {
    const h = createHarness(() => 100);
    h.loop.start();
    h.frame(0);
    h.loop.enqueue(plantA);
    h.loop.enqueue(plantB);

    expect(h.eventBatches).toEqual([]);
    h.frame(300);

    expect(h.eventBatches).toEqual([[
      { type: 'Planted', plotId: 'plot-0', speciesId: 'sunny-sprout' },
      { type: 'Planted', plotId: 'plot-1', speciesId: 'bubble-berry' },
    ]]);
    expect(h.frames.at(-1)?.current).toBe(100);

    h.frame(400);
    expect(h.eventBatches).toHaveLength(1);
  });

  it('reads wall time once per tick, independently of RAF timestamps', () => {
    const nowMs = vi.fn().mockReturnValueOnce(12_345).mockReturnValueOnce(12_678);
    const h = createHarness(nowMs);
    h.loop.start();
    h.frame(90_000);

    expect(nowMs).not.toHaveBeenCalled();
    h.frame(90_250);

    expect(nowMs).toHaveBeenCalledTimes(2);
    expect(h.frames.at(-1)).toEqual({ previous: 12_345, current: 12_678, alpha: 0.5 });
  });

  it('passes adjacent snapshots after multiple ticks in one RAF callback', () => {
    let wallTime = 0;
    const h = createHarness(() => wallTime += SIM_DT_MS);
    h.loop.start();
    h.frame(0);

    h.frame(300);

    expect(h.frames.at(-1)).toEqual({ previous: 100, current: 200, alpha: 0.5 });
  });

  it('keeps start and stop idempotent and cancels the outstanding RAF request', () => {
    const h = createHarness();
    h.loop.start();
    h.loop.start();
    expect(h.callbacks.size).toBe(1);
    expect(h.requestFrame).toHaveBeenCalledTimes(1);

    h.loop.stop();
    h.loop.stop();
    expect(h.cancelFrame).toHaveBeenCalledTimes(1);
    expect(h.callbacks.size).toBe(0);

    h.loop.start();
    expect(h.callbacks.size).toBe(1);
    expect(h.requestFrame).toHaveBeenCalledTimes(2);
  });

  it('delivers events once when a tick produces them, without replaying them on render', () => {
    const h = createHarness(() => 100);
    h.loop.start();
    h.frame(0);
    h.loop.enqueue(plantA);

    h.frame(100);
    h.frame(125);
    h.frame(150);

    expect(h.frames).toHaveLength(4);
    expect(h.eventBatches).toEqual([[
      { type: 'Planted', plotId: 'plot-0', speciesId: 'sunny-sprout' },
    ]]);
  });
});
