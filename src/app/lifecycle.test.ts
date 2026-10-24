import { describe, expect, it, vi } from 'vitest';
import { createInitialState, step } from '../sim';
import type { Command, GardenState, SimEvent } from '../sim';
import { createFixedStepLoop, type RenderFrame } from './loop';
import { createPageLifecycle } from './lifecycle';

function createHarness(initialState: GardenState = createInitialState(1, 0)) {
  let hidden = false;
  let nextHandle = 1;
  const frames = new Map<number, (timestampMs: number) => void>();
  const requestFrame = vi.fn((callback: (timestampMs: number) => void) => {
    const handle = nextHandle++;
    frames.set(handle, callback);
    return handle;
  });
  const cancelFrame = vi.fn((handle: number) => frames.delete(handle));
  const renderFrames: RenderFrame[] = [];
  const eventBatches: (readonly SimEvent[])[] = [];
  const nowMs = vi.fn(() => 10_000);
  const cancelGesture = vi.fn();
  const listeners = {
    visibility: new Set<() => void>(),
    pagehide: new Set<() => void>(),
    pageshow: new Set<() => void>(),
  };
  const subscribe = (key: keyof typeof listeners) => (listener: () => void) => {
    listeners[key].add(listener);
    return () => listeners[key].delete(listener);
  };
  const loop = createFixedStepLoop({
    initialState,
    nowMs,
    requestFrame,
    cancelFrame,
    onRender: (frame) => renderFrames.push(frame),
    onEvents: (events) => eventBatches.push([...events]),
  });
  const lifecycle = createPageLifecycle({
    loop,
    isHidden: () => hidden,
    subscribeVisibility: subscribe('visibility'),
    subscribePageHide: subscribe('pagehide'),
    subscribePageShow: subscribe('pageshow'),
    cancelGesture,
  });

  const emit = (key: keyof typeof listeners) => {
    for (const listener of [...listeners[key]]) listener();
  };
  const setHidden = (value: boolean) => {
    hidden = value;
    emit('visibility');
  };
  const runFrame = (timestampMs: number) => {
    expect(frames.size).toBe(1);
    const [handle, callback] = [...frames.entries()][0]!;
    frames.delete(handle);
    callback(timestampMs);
  };

  return {
    lifecycle,
    loop,
    setHidden,
    emit,
    runFrame,
    frames,
    listeners,
    nowMs,
    requestFrame,
    cancelFrame,
    cancelGesture,
    renderFrames,
    eventBatches,
  };
}

const harvest: Command = { type: 'Harvest', plotIds: ['plot-0'] };

describe('page lifecycle', () => {
  it('does no frame or sim work while initially hidden', () => {
    const h = createHarness();
    h.setHidden(true);

    h.lifecycle.start();

    expect(h.frames.size).toBe(0);
    expect(h.requestFrame).not.toHaveBeenCalled();
    expect(h.nowMs).not.toHaveBeenCalled();
    expect(h.renderFrames).toHaveLength(0);
    expect(h.cancelGesture).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending RAF and gesture on hide, and performs no work until shown', () => {
    const h = createHarness();
    h.lifecycle.start();
    h.runFrame(0);
    const canceledFrame = [...h.frames.values()][0]!;

    h.setHidden(true);

    expect(h.cancelFrame).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(0);
    expect(h.cancelGesture).toHaveBeenCalledTimes(1);
    canceledFrame(50_000);
    h.setHidden(true);

    expect(h.nowMs).not.toHaveBeenCalled();
    expect(h.renderFrames).toHaveLength(1);
    expect(h.requestFrame).toHaveBeenCalledTimes(2);
    expect(h.cancelGesture).toHaveBeenCalledTimes(1);
  });

  it('does one timestamp catch-up, consumes queued commands once and resumes one RAF chain', () => {
    const plantedState = step(
      createInitialState(1, 0),
      [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }],
      0,
    ).state;
    const h = createHarness(plantedState);
    h.lifecycle.start();
    h.runFrame(0);
    h.loop.enqueue(harvest);
    h.setHidden(true);
    h.nowMs.mockReturnValue(10_000);

    h.setHidden(false);
    h.setHidden(false);
    h.emit('pageshow');

    expect(h.nowMs).toHaveBeenCalledTimes(1);
    expect(h.requestFrame).toHaveBeenCalledTimes(3);
    expect(h.frames.size).toBe(1);
    expect(h.eventBatches).toEqual([[
      { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Growing' },
      { type: 'StageReached', plotId: 'plot-0', stage: 'Mature' },
      { type: 'Harvestable', plotId: 'plot-0' },
      expect.objectContaining({ type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', lucky: true, coins: 6 }),
      { type: 'LuckyHarvest', plotId: 'plot-0' },
      expect.objectContaining({ type: 'HarvestCompleted', count: 1, coins: 6 }),
    ]]);
    const resumed = h.renderFrames.at(-1)!;
    expect(resumed.previous).toEqual(resumed.current);
    expect(resumed.current.nowMs).toBe(10_000);
    expect(resumed.current.coins).toBe(17);
    expect(resumed.current.plots[0]?.plant).toBeNull();

    h.runFrame(0);
    h.runFrame(100);
    expect(h.nowMs).toHaveBeenCalledTimes(2);
    expect(h.eventBatches).toHaveLength(1);
    expect(h.renderFrames.at(-1)?.current.coins).toBe(17);
    expect(h.requestFrame).toHaveBeenCalledTimes(5);
  });

  it('ignores repeated page transitions and removes every listener on dispose', () => {
    const h = createHarness();
    h.lifecycle.start();
    h.lifecycle.start();
    h.emit('pagehide');
    h.emit('pagehide');
    h.emit('pageshow');
    h.emit('pageshow');

    expect(h.requestFrame).toHaveBeenCalledTimes(2);
    expect(h.frames.size).toBe(1);
    expect(h.cancelGesture).toHaveBeenCalledTimes(1);

    h.lifecycle.dispose();

    expect(h.frames.size).toBe(0);
    expect(h.listeners.visibility.size).toBe(0);
    expect(h.listeners.pagehide.size).toBe(0);
    expect(h.listeners.pageshow.size).toBe(0);

    h.setHidden(true);
    h.setHidden(false);
    h.emit('pagehide');
    h.emit('pageshow');
    expect(h.requestFrame).toHaveBeenCalledTimes(2);
    expect(h.nowMs).toHaveBeenCalledTimes(1);
  });
});
