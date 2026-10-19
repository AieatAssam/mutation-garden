import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlotId } from '../sim';
import { createPointerInput, POINTER_TAP_MOVE_THRESHOLD_CSS_PX, type PickResult } from './pointer';
import type { InputIntent } from './types';

function createCanvas() {
  const listeners = new Map<string, Set<EventListener>>();
  const fallbackListeners = new Map<string, Set<EventListener>>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const capturedPointers = new Set<number>();
  const defaultView = {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const typedListener = listener as EventListener;
      const handlers = fallbackListeners.get(type) ?? new Set<EventListener>();
      handlers.add(typedListener);
      fallbackListeners.set(type, handlers);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      fallbackListeners.get(type)?.delete(listener as EventListener);
    }),
  } as unknown as Window;
  const ownerDocument = {
    defaultView,
    visibilityState: 'visible',
    hidden: false,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const typedListener = listener as EventListener;
      const handlers = documentListeners.get(type) ?? new Set<EventListener>();
      handlers.add(typedListener);
      documentListeners.set(type, handlers);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      documentListeners.get(type)?.delete(listener as EventListener);
    }),
  } as unknown as Document;
  const canvas = {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject, _options?: AddEventListenerOptions | boolean) => {
      void _options;
      const typedListener = listener as EventListener;
      const handlers = listeners.get(type) ?? new Set<EventListener>();
      handlers.add(typedListener);
      listeners.set(type, handlers);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject, _options?: EventListenerOptions | boolean) => {
      void _options;
      listeners.get(type)?.delete(listener as EventListener);
    }),
    setPointerCapture: vi.fn((pointerId: number) => { capturedPointers.add(pointerId); }),
    releasePointerCapture: vi.fn((pointerId: number) => { capturedPointers.delete(pointerId); }),
    hasPointerCapture: vi.fn((pointerId: number) => capturedPointers.has(pointerId)),
    ownerDocument,
    clientHeight: 600,
  } as unknown as HTMLCanvasElement;

  function dispatch(type: string, init: Partial<PointerEvent> = {}): void {
    const event = {
      type,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: 20,
      clientY: 30,
      target: canvas,
      currentTarget: canvas,
      preventDefault: vi.fn(),
      ...init,
    } as unknown as PointerEvent;
    listeners.get(type)?.forEach((handler) => handler(event as unknown as Event));
  }

  function dispatchWindow(type: string, init: Partial<PointerEvent> = {}): void {
    const event = {
      type,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: 20,
      clientY: 30,
      target: {} as EventTarget,
      currentTarget: defaultView,
      preventDefault: vi.fn(),
      ...init,
    } as unknown as PointerEvent;
    // Pointerup/cancel bubbles through the owner document before reaching the
    // window fallback listener, so run document capture handlers first.
    if (type === 'pointerup' || type === 'pointercancel') dispatchDocument(type, init);
    fallbackListeners.get(type)?.forEach((handler) => handler(event));
  }

  function dispatchWheel(init: Partial<WheelEvent> = {}): WheelEvent {
    const event = {
      type: 'wheel',
      deltaX: 0,
      deltaY: 100,
      deltaMode: 0,
      ctrlKey: false,
      target: canvas,
      currentTarget: canvas,
      cancelable: true,
      preventDefault: vi.fn(),
      ...init,
    } as unknown as WheelEvent;
    listeners.get('wheel')?.forEach((handler) => handler(event));
    return event;
  }

  function dispatchDocument(type: string, init: Partial<PointerEvent> = {}): void {
    const event = {
      type,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 30,
      target: {} as EventTarget,
      currentTarget: ownerDocument,
      preventDefault: vi.fn(),
      ...init,
    } as unknown as PointerEvent;
    documentListeners.get(type)?.forEach((handler) => handler(event));
  }

  return { canvas, defaultView, dispatch, dispatchDocument, dispatchWindow, dispatchWheel, documentListeners, fallbackListeners, listeners, ownerDocument };
}

function setup(pickResult: (x: number, y: number) => PickResult = () => ({ kind: 'plot', plotId: 'plot-2' as PlotId })) {
  const { canvas, defaultView, dispatch, dispatchDocument, dispatchWindow, dispatchWheel, documentListeners, fallbackListeners, listeners, ownerDocument } = createCanvas();
  const intents: InputIntent[] = [];
  const pick = vi.fn(pickResult);
  const onIntent = vi.fn((intent: InputIntent) => intents.push(intent));
  const input = createPointerInput(canvas, pick, onIntent);
  const down = (overrides: Partial<PointerEvent> = {}) => dispatch('pointerdown', overrides);
  const move = (overrides: Partial<PointerEvent> = {}) => dispatch('pointermove', overrides);
  const up = (overrides: Partial<PointerEvent> = {}) => dispatch('pointerup', overrides);

  return { canvas, defaultView, dispatch, dispatchDocument, dispatchWindow, dispatchWheel, documentListeners, down, fallbackListeners, intents, input, listeners, move, onIntent, ownerDocument, pick, up };
}

describe('plot pointer input', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits one activation for a valid touch tap using the plot picked on pointerdown', () => {
    const picker = vi.fn((x: number) => ({ kind: 'plot', plotId: (x < 25 ? 'plot-2' : 'plot-4') as PlotId } as const));
    const { down, intents, move, pick, up } = setup(picker);

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 24, clientY: 30 });
    up({ clientX: 24, clientY: 30 });

    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid primary mouse click', () => {
    const { down, intents, up } = setup();

    down({ pointerType: 'mouse', clientX: 80, clientY: 90 });
    up({ pointerType: 'mouse', clientX: 80, clientY: 90 });

    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('uses an exact 10 CSS-pixel movement threshold', () => {
    expect(POINTER_TAP_MOVE_THRESHOLD_CSS_PX).toBe(10);
    const { down, intents, move, up } = setup();

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 30, clientY: 30 });
    up({ clientX: 30, clientY: 30 });

    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('cancels a tap when pointerup crosses the threshold without a move event', () => {
    const { down, intents, up } = setup();

    down({ clientX: 20, clientY: 30 });
    up({ clientX: 30.01, clientY: 30 });

    expect(intents).toEqual([]);
  });

  it.each([
    ['vertical', 20, 41],
    ['diagonal', 28, 38],
  ])('cancels a %s drag over the threshold', (_direction, clientX, clientY) => {
    const { down, intents, move, up } = setup();

    down({ clientX: 20, clientY: 30 });
    move({ clientX, clientY });
    up({ clientX, clientY });

    expect(intents).toEqual([]);
  });

  it('keeps a gesture cancelled after crossing the threshold and returning to its start', () => {
    const { down, intents, move, up } = setup();

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 31, clientY: 30 });
    move({ clientX: 20, clientY: 30 });
    up({ clientX: 20, clientY: 30 });

    expect(intents).toEqual([]);
  });

  it('emits at most once for duplicate pointerup events', () => {
    const { down, intents, up } = setup();

    down();
    up();
    up();

    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('ignores mismatched pointer moves and up events without retargeting the gesture', () => {
    const { down, intents, move, up } = setup();

    down({ pointerId: 7 });
    move({ pointerId: 8, clientX: 100, clientY: 30 });
    up({ pointerId: 8 });
    expect(intents).toEqual([]);
    up({ pointerId: 7 });
    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('ignores a non-primary mouse button', () => {
    const { down, intents, up } = setup();

    down({ pointerType: 'mouse', button: 2 });
    up({ pointerType: 'mouse', button: 2 });

    expect(intents).toEqual([]);
  });

  it('cancels the active tap when a second pointer goes down', () => {
    const { down, intents, up } = setup();

    down({ pointerId: 1 });
    down({ pointerId: 2, isPrimary: false });
    up({ pointerId: 1 });
    up({ pointerId: 2, isPrimary: false });

    expect(intents).toEqual([]);
  });

  it.each([
    ['ground', () => ({ kind: 'ground' } as const)],
    ['miss', () => null],
  ])('does not activate when the pointer starts on %s, even if it ends on a plot', (_label, startPick) => {
    const picker = vi.fn((x: number): PickResult => x < 30 ? startPick() : { kind: 'plot', plotId: 'plot-4' as PlotId });
    const { down, intents, up } = setup(picker);

    down({ clientX: 20, clientY: 30 });
    up({ clientX: 21, clientY: 30 });

    expect(intents).toEqual([]);
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('rejects a pointerdown whose event target is a UI element', () => {
    const { down, intents, up } = setup();

    down({ target: {} as EventTarget });
    up();

    expect(intents).toEqual([]);
  });

  it('does not activate after pointercancel or an unexpected lost pointer capture', () => {
    for (const terminalEvent of ['pointercancel', 'lostpointercapture']) {
      const { dispatch, down, intents, up } = setup();
      down();
      dispatch(terminalEvent);
      up();
      expect(intents, terminalEvent).toEqual([]);
    }
  });

  it('continues to recognize a tap when pointer capture fails', () => {
    const { canvas, down, intents, up } = setup();
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down();
    up();

    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('continues after pointer release fails and emits no duplicate intent', () => {
    const { canvas, down, intents, up } = setup();
    vi.mocked(canvas.releasePointerCapture).mockImplementation(() => { throw new Error('capture already lost'); });

    down();
    up();
    up();

    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('ends failed-capture ownership on off-canvas up and accepts the next tap', () => {
    const { canvas, dispatchWindow, down, fallbackListeners, intents, up } = setup();
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down({ pointerId: 3, clientX: 20, clientY: 30 });
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);
    dispatchWindow('pointermove', { pointerId: 3, clientX: 32, clientY: 30 });
    dispatchWindow('pointermove', { pointerId: 3, clientX: 20, clientY: 30 });
    dispatchWindow('pointerup', { pointerId: 3, clientX: 20, clientY: 30, target: {} as EventTarget });
    expect(intents).toEqual([]);
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);

    down({ pointerId: 4, clientX: 20, clientY: 30 });
    up({ pointerId: 4, clientX: 20, clientY: 30 });
    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
  });

  it.each(['pointerup', 'pointercancel', 'cancelGesture', 'dispose'] as const)(
    'removes fallback listeners after %s',
    (ending) => {
      const { canvas, dispatchWindow, down, fallbackListeners, input } = setup();
      vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });
      down({ pointerId: 5 });
      expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);

      if (ending === 'pointerup' || ending === 'pointercancel') {
        dispatchWindow(ending, { pointerId: 5 });
      } else if (ending === 'cancelGesture') {
        input.cancelGesture();
        expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);
        dispatchWindow('pointerup', { pointerId: 5 });
      } else {
        input.dispose();
      }

      expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
      expect(canvas.ownerDocument.defaultView?.removeEventListener).toHaveBeenCalledTimes(3);
    },
  );

  it('keeps fallback listeners until both pointers from a second-pointer cancellation end', () => {
    const { canvas, dispatchWindow, down, fallbackListeners, intents, up } = setup();
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down({ pointerId: 3 });
    down({ pointerId: 4, isPrimary: false });
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);

    up({ pointerId: 3 });
    expect(intents).toEqual([]);
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);
    dispatchWindow('pointerup', { pointerId: 4, target: {} as EventTarget });
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(intents).toEqual([]);

    down({ pointerId: 5 });
    up({ pointerId: 5 });
    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('keeps fallback listeners after explicit cancellation until off-canvas up, then accepts a new tap', () => {
    const { canvas, dispatchWindow, down, fallbackListeners, input, intents, up } = setup();
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down({ pointerId: 6 });
    input.cancelGesture();
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);

    dispatchWindow('pointerup', { pointerId: 6, target: {} as EventTarget });
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(intents).toEqual([]);

    down({ pointerId: 7 });
    up({ pointerId: 7 });
    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);
  });

  it('cancels a canvas tap when a second pointer starts on a UI sibling', () => {
    const { canvas, dispatchDocument, dispatchWindow, documentListeners, down, fallbackListeners, input, intents, ownerDocument, pick, up } = setup();
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down({ pointerId: 3 });
    expect(pick).toHaveBeenCalledTimes(1);
    dispatchDocument('pointerdown', { pointerId: 4, target: {} as EventTarget });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(intents).toEqual([]);
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);

    up({ pointerId: 3 });
    expect(intents).toEqual([]);
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);
    dispatchWindow('pointerup', { pointerId: 4, target: {} as EventTarget });
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(intents).toEqual([]);

    down({ pointerId: 5 });
    up({ pointerId: 5 });
    expect(pick).toHaveBeenCalledTimes(2);
    expect(intents).toEqual([{ type: 'ActivatePlot', plotId: 'plot-2' }]);

    input.dispose();
    expect([...documentListeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(ownerDocument.removeEventListener).toHaveBeenCalledTimes(3);
    expect(ownerDocument.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(ownerDocument.removeEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function), true);
    expect(ownerDocument.removeEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function), true);
  });

  it('cancels a pending tap when the owner calls cancelGesture', () => {
    const { down, input, intents, up } = setup();

    down();
    input.cancelGesture();
    up();

    expect(intents).toEqual([]);
  });

  it('removes each registered listener once and ignores all activity after idempotent disposal', () => {
    const { canvas, down, dispatch, input, intents, listeners, up } = setup();
    const listenerCount = [...listeners.values()].reduce((count, group) => count + group.size, 0);
    expect(listenerCount).toBeGreaterThan(0);

    down();
    input.dispose();
    input.dispose();
    up();
    dispatch('pointerdown');
    dispatch('pointerup');

    expect(intents).toEqual([]);
    expect(canvas.removeEventListener).toHaveBeenCalledTimes(listenerCount);
    expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(canvas.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect([...listeners.values()].every((group) => group.size === 0)).toBe(true);
  });

  it('locks ownership to ground on pointerdown and pans incrementally after the strict threshold', () => {
    const picker = vi.fn((x: number): PickResult => x < 25
      ? { kind: 'ground' }
      : { kind: 'plot', plotId: 'plot-4' as PlotId });
    const { down, intents, move, pick, up } = setup(picker);

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 27, clientY: 30 });
    move({ clientX: 31, clientY: 30 });
    move({ clientX: 36, clientY: 30 });
    up({ clientX: 38, clientY: 30 });

    expect(pick).toHaveBeenCalledTimes(1);
    expect(intents).toEqual([
      { type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 },
      { type: 'PanCamera', deltaXCss: 5, deltaYCss: 0 },
      { type: 'PanCamera', deltaXCss: 2, deltaYCss: 0 },
    ]);
  });

  it('does not pan at exactly 10px from a ground down point', () => {
    const { down, intents, move, up } = setup(() => ({ kind: 'ground' }));

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 30, clientY: 30 });
    up({ clientX: 30, clientY: 30 });

    expect(intents).toEqual([]);
  });

  it('returns the camera to its original offset when a ground drag crosses and reverses the threshold', () => {
    const { down, intents, move, up } = setup(() => ({ kind: 'ground' }));

    down({ clientX: 0, clientY: 0 });
    move({ clientX: 20, clientY: 0 });
    move({ clientX: 0, clientY: 0 });
    up({ clientX: 0, clientY: 0 });

    expect(intents).toEqual([
      { type: 'PanCamera', deltaXCss: 10, deltaYCss: 0 },
      { type: 'PanCamera', deltaXCss: -10, deltaYCss: 0 },
    ]);
    expect(intents.some(intent => intent.type === 'ActivatePlot')).toBe(false);
  });

  it('keeps plot-start ownership while dragging across ground', () => {
    const picker = vi.fn((x: number): PickResult => x < 25
      ? { kind: 'plot', plotId: 'plot-2' as PlotId }
      : { kind: 'ground' });
    const { down, intents, move, pick, up } = setup(picker);

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 40, clientY: 30 });
    up({ clientX: 40, clientY: 30 });

    expect(pick).toHaveBeenCalledTimes(1);
    expect(intents).toEqual([]);
  });

  it.each([
    ['miss', () => null],
    ['ground', () => ({ kind: 'ground' } as const)],
  ])('never pans for a %s down, even when later movement crosses a plot', (_label, startPick) => {
    const picker = vi.fn((x: number): PickResult => x < 25
      ? startPick()
      : { kind: 'plot', plotId: 'plot-4' as PlotId });
    const { down, intents, move, pick, up } = setup(picker);

    down({ clientX: 20, clientY: 30 });
    move({ clientX: 40, clientY: 30 });
    up({ clientX: 40, clientY: 30 });

    expect(pick).toHaveBeenCalledTimes(1);
    expect(intents).toEqual(startPick() === null ? [] : [{ type: 'PanCamera', deltaXCss: 10, deltaYCss: 0 }]);
  });

  it('uses pointerup coordinates for the final ground pan delta', () => {
    const { down, intents, up } = setup(() => ({ kind: 'ground' }));

    down({ clientX: 20, clientY: 30 });
    up({ clientX: 31, clientY: 26 });

    expect(intents).toEqual([{ type: 'PanCamera', deltaXCss: expect.closeTo(11 - 10 * 11 / Math.hypot(11, 4)), deltaYCss: expect.closeTo(-4 + 10 * 4 / Math.hypot(11, 4)) }]);
  });

  it('advances pointer coordinates independently of a renderer clamp', () => {
    const { down, intents, move, up } = setup(() => ({ kind: 'ground' }));

    down({ clientX: 0, clientY: 0 });
    move({ clientX: 11, clientY: 0 });
    move({ clientX: 1_000, clientY: 0 });
    move({ clientX: 1_005, clientY: 0 });
    up({ clientX: 1_005, clientY: 0 });

    expect(intents).toEqual([
      { type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 },
      { type: 'PanCamera', deltaXCss: 989, deltaYCss: 0 },
      { type: 'PanCamera', deltaXCss: 5, deltaYCss: 0 },
    ]);
  });

  it.each(['pointercancel', 'lostpointercapture'] as const)(
    'does not emit a trailing activation after %s during a plot gesture',
    (terminalEvent) => {
      const { dispatch, down, intents, up } = setup();

      down({ pointerId: 9 });
      dispatch(terminalEvent, { pointerId: 9 });
      up({ pointerId: 9 });

      expect(intents).toEqual([]);
    },
  );

  it('does not emit a trailing activation after capture failure and off-canvas movement/up', () => {
    const { canvas, dispatchWindow, down, intents } = setup();
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down({ pointerId: 10, clientX: 20, clientY: 30 });
    dispatchWindow('pointermove', { pointerId: 10, clientX: 40, clientY: 30 });
    dispatchWindow('pointerup', { pointerId: 10, clientX: 40, clientY: 30, target: {} as EventTarget });

    expect(intents).toEqual([]);
  });

  it.each(['second pointer', 'UI-origin pointer', 'visibility cancellation', 'disposal'] as const)(
    'does not emit a trailing tap after %s cancels a plot gesture',
    (cancellation) => {
      const { dispatchDocument, down, input, intents, up } = setup();
      down({ pointerId: 11 });
      if (cancellation === 'second pointer') down({ pointerId: 12, isPrimary: false });
      if (cancellation === 'UI-origin pointer') dispatchDocument('pointerdown', { pointerId: 12, target: {} as EventTarget });
      if (cancellation === 'visibility cancellation') input.cancelGesture();
      if (cancellation === 'disposal') input.dispose();
      up({ pointerId: 11 });

      expect(intents).toEqual([]);
    },
  );
});

describe('owned two-touch pinch input', () => {
  afterEach(() => vi.restoreAllMocks());

  function beginGroundPinch() {
    const { down, intents, move, up, ...rest } = setup(() => ({ kind: 'ground' }));
    down({ pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 });
    down({ pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 100, clientY: 0 });
    return {
      ...rest,
      down,
      intents,
      move,
      up,
      moveFirst: (clientX: number, clientY = 0) => move({ pointerId: 1, clientX, clientY }),
      moveSecond: (clientX: number, clientY = 0) => move({ pointerId: 2, clientX, clientY }),
      upFirst: () => up({ pointerId: 1 }),
      upSecond: () => up({ pointerId: 2, isPrimary: false }),
    };
  }

  it.each([
    ['outward', 120, 120 / 110],
    ['inward', 80, 80 / 90],
  ])('emits an incremental zoom for an eligible %s pinch after removing the dead zone', (_direction, distance, scale) => {
    const { intents, moveSecond } = beginGroundPinch();

    moveSecond(distance);

    expect(intents).toEqual([{ type: 'ZoomCamera', scale }]);
  });

  it('does not zoom at the exact threshold and starts just beyond it', () => {
    const { intents, moveSecond } = beginGroundPinch();

    moveSecond(110);
    expect(intents).toEqual([]);

    moveSecond(110.01);
    expect(intents).toEqual([{ type: 'ZoomCamera', scale: 110.01 / 110 }]);
  });

  it('updates the distance baseline through a zoom clamp so reversing direction zooms back out', () => {
    const { intents, moveSecond } = beginGroundPinch();
    let zoom = 1;

    moveSecond(200);
    const outward = intents.at(-1);
    expect(outward).toEqual({ type: 'ZoomCamera', scale: 200 / 110 });
    if (outward?.type === 'ZoomCamera') zoom = Math.min(1.35, zoom * outward.scale);
    expect(zoom).toBe(1.35);

    moveSecond(190);
    const reversal = intents.at(-1);
    expect(reversal).toEqual({ type: 'ZoomCamera', scale: 0.95 });
    if (reversal?.type === 'ZoomCamera') zoom *= reversal.scale;
    expect(zoom).toBeCloseTo(1.2825);
    expect(intents).toEqual([
      { type: 'ZoomCamera', scale: 200 / 110 },
      { type: 'ZoomCamera', scale: 0.95 },
    ]);
  });

  it.each([
    ['plot or plant', () => ({ kind: 'plot', plotId: 'plot-2' as PlotId })],
    ['miss', () => null],
  ])('rejects a pinch when the first contact began on a %s', (_label, firstPick) => {
    const picker = vi.fn((x: number): PickResult => x === 0 ? firstPick() as PickResult : { kind: 'ground' });
    const { down, intents, move, up } = setup(picker);

    down({ pointerId: 1, clientX: 0, clientY: 0 });
    down({ pointerId: 2, isPrimary: false, clientX: 100, clientY: 0 });
    move({ pointerId: 2, clientX: 130, clientY: 0 });
    up({ pointerId: 2, isPrimary: false });
    up({ pointerId: 1 });

    expect(intents).toEqual([]);
    expect(picker).toHaveBeenCalledTimes(2);
  });

  it('rejects a pair when the second contact starts on a UI sibling and suppresses the remaining finger', () => {
    const { dispatchDocument, dispatchWindow, down, intents, move, up } = setup(() => ({ kind: 'ground' }));

    down({ pointerId: 1, clientX: 0, clientY: 0 });
    dispatchDocument('pointerdown', { pointerId: 2, pointerType: 'touch', target: {} as EventTarget, clientX: 100, clientY: 0 });
    move({ pointerId: 1, clientX: 50, clientY: 0 });
    up({ pointerId: 1 });
    dispatchWindow('pointerup', { pointerId: 2, target: {} as EventTarget });

    expect(intents).toEqual([]);

    down({ pointerId: 3, clientX: 0, clientY: 0 });
    move({ pointerId: 3, clientX: 11, clientY: 0 });
    up({ pointerId: 3, clientX: 11, clientY: 0 });
    expect(intents).toEqual([{ type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 }]);
  });

  it('rejects a third contact and suppresses zoom, pan, and activation until every contact ends', () => {
    const { down, intents, move, up } = beginGroundPinch();
    down({ pointerId: 3, pointerType: 'touch', isPrimary: false, clientX: 50, clientY: 80 });
    move({ pointerId: 2, clientX: 140, clientY: 0 });
    move({ pointerId: 1, clientX: 30, clientY: 0 });
    up({ pointerId: 1 });
    up({ pointerId: 2, isPrimary: false });
    up({ pointerId: 3, isPrimary: false });

    expect(intents).toEqual([]);
  });

  it('rejects a pair whose contacts use different pointer devices', () => {
    const { down, intents, move, up } = setup(() => ({ kind: 'ground' }));

    down({ pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0 });
    down({ pointerId: 2, pointerType: 'pen', isPrimary: false, clientX: 100, clientY: 0 });
    move({ pointerId: 2, clientX: 130, clientY: 0 });
    up({ pointerId: 2, pointerType: 'pen', isPrimary: false });
    up({ pointerId: 1 });

    expect(intents).toEqual([]);
  });

  it.each([
    ['first', 1],
    ['second', 2],
  ])('does not resume the remaining finger as a pan after the %s pointer lifts', (_label, liftedId) => {
    const { down, intents, move, up } = beginGroundPinch();
    move({ pointerId: 2, clientX: 130, clientY: 0 });
    up({ pointerId: liftedId, isPrimary: liftedId === 1, clientX: liftedId === 1 ? 0 : 130, clientY: 0 });
    const remainingId = liftedId === 1 ? 2 : 1;
    move({ pointerId: remainingId, clientX: 0, clientY: 50 });
    up({ pointerId: remainingId, isPrimary: remainingId === 1, clientX: remainingId === 1 ? 0 : 130, clientY: 0 });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: 130 / 110 }]);

    down({ pointerId: 3, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 });
    move({ pointerId: 3, clientX: 11, clientY: 0 });
    up({ pointerId: 3, clientX: 11, clientY: 0 });
    expect(intents).toEqual([
      { type: 'ZoomCamera', scale: 130 / 110 },
      { type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 },
    ]);
  });

  it.each(['pointercancel', 'lostpointercapture'] as const)(
    'cancels a pinch after %s, suppresses remaining contacts, then accepts a fresh gesture',
    (terminalEvent) => {
      const { dispatch, dispatchWindow, down, fallbackListeners, intents, move, up } = beginGroundPinch();
      move({ pointerId: 2, clientX: 130, clientY: 0 });
      dispatch(terminalEvent, { pointerId: 2 });
      move({ pointerId: 1, clientX: 30, clientY: 0 });
      dispatchWindow('pointerup', { pointerId: 1, target: {} as EventTarget });
      if (terminalEvent === 'lostpointercapture') {
        dispatchWindow('pointerup', { pointerId: 2, target: {} as EventTarget, isPrimary: false });
      }

      expect(intents).toEqual([{ type: 'ZoomCamera', scale: 130 / 110 }]);
      expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);

      down({ pointerId: 3, clientX: 0, clientY: 0 });
      move({ pointerId: 3, clientX: 11, clientY: 0 });
      up({ pointerId: 3, clientX: 11, clientY: 0 });
      expect(intents.at(-1)).toEqual({ type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 });
    },
  );

  it.each(['lifecycle cancellation', 'disposal'] as const)(
    'suppresses remaining-contact activity after %s',
    (ending) => {
      const { dispatchWindow, down, fallbackListeners, input, intents, move, up } = beginGroundPinch();
      move({ pointerId: 2, clientX: 130, clientY: 0 });
      if (ending === 'lifecycle cancellation') input.cancelGesture();
      else input.dispose();
      if (ending === 'lifecycle cancellation') {
        dispatchWindow('pointermove', { pointerId: 1, clientX: 30, clientY: 0, target: {} as EventTarget });
        dispatchWindow('pointerup', { pointerId: 1, target: {} as EventTarget });
        dispatchWindow('pointerup', { pointerId: 2, isPrimary: false, target: {} as EventTarget });
      } else {
        move({ pointerId: 1, clientX: 30, clientY: 0 });
        up({ pointerId: 1 });
        up({ pointerId: 2, isPrimary: false });
      }

      expect(intents).toEqual([{ type: 'ZoomCamera', scale: 130 / 110 }]);
      expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
      if (ending === 'lifecycle cancellation') {
        down({ pointerId: 3, clientX: 0, clientY: 0 });
        move({ pointerId: 3, clientX: 11, clientY: 0 });
        up({ pointerId: 3, clientX: 11, clientY: 0 });
        expect(intents.at(-1)).toEqual({ type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 });
      }
    },
  );

  it('keeps cancelled pinch contacts owned through lost capture until fallback pointerup ends each contact', () => {
    const { canvas, dispatch, dispatchWindow, down, fallbackListeners, input, intents, move, up } = setup(() => ({ kind: 'ground' }));
    const releaseCapture = vi.mocked(canvas.releasePointerCapture);
    const releaseCaptureNormally = releaseCapture.getMockImplementation();
    releaseCapture.mockImplementation((pointerId) => {
      releaseCaptureNormally?.(pointerId);
      dispatch('lostpointercapture', { pointerId });
    });
    down({ pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 });
    down({ pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 100, clientY: 0 });

    input.cancelGesture();
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);

    // A new contact cannot take ownership while either cancelled pinch finger remains down.
    down({ pointerId: 3, pointerType: 'touch', isPrimary: false, clientX: 0, clientY: 0 });
    move({ pointerId: 3, clientX: 20, clientY: 0 });
    dispatchWindow('pointerup', { pointerId: 3, target: {} as EventTarget, clientX: 20, clientY: 0 });
    dispatchWindow('pointerup', { pointerId: 1, target: {} as EventTarget });
    expect([...fallbackListeners.values()].reduce((count, group) => count + group.size, 0)).toBe(3);

    // Ending one original contact still leaves the sequence blocked for the other.
    down({ pointerId: 4, pointerType: 'touch', isPrimary: false, clientX: 0, clientY: 0 });
    move({ pointerId: 4, clientX: 20, clientY: 0 });
    dispatchWindow('pointerup', { pointerId: 4, target: {} as EventTarget, clientX: 20, clientY: 0 });
    dispatchWindow('pointerup', { pointerId: 2, isPrimary: false, target: {} as EventTarget });
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(intents).toEqual([]);

    down({ pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 });
    move({ pointerId: 5, clientX: 11, clientY: 0 });
    up({ pointerId: 5, clientX: 11, clientY: 0 });
    expect(intents).toEqual([{ type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 }]);
  });

  it('cleans up failed-capture fallback listeners and accepts a fresh gesture after all contacts release', () => {
    const { canvas, dispatchWindow, down, fallbackListeners, intents, move, up } = setup(() => ({ kind: 'ground' }));
    vi.mocked(canvas.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable'); });

    down({ pointerId: 1, clientX: 0, clientY: 0 });
    down({ pointerId: 2, isPrimary: false, clientX: 100, clientY: 0 });
    move({ pointerId: 2, clientX: 120, clientY: 0 });
    dispatchWindow('pointerup', { pointerId: 2, isPrimary: false, clientX: 120, clientY: 0 });
    dispatchWindow('pointerup', { pointerId: 1, clientX: 0, clientY: 0 });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: 120 / 110 }]);
    expect([...fallbackListeners.values()].every((group) => group.size === 0)).toBe(true);

    down({ pointerId: 3, clientX: 0, clientY: 0 });
    move({ pointerId: 3, clientX: 11, clientY: 0 });
    up({ pointerId: 3, clientX: 11, clientY: 0 });
    expect(intents.at(-1)).toEqual({ type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 });
  });

  it('lets the canvas listener claim a second contact after document capture sees its canvas target', () => {
    const { canvas, dispatchDocument, down, intents, move } = setup(() => ({ kind: 'ground' }));
    down({ pointerId: 1, clientX: 0, clientY: 0 });
    dispatchDocument('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: false,
      target: canvas,
      clientX: 100,
      clientY: 0,
    });
    down({ pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 100, clientY: 0 });
    move({ pointerId: 2, clientX: 120, clientY: 0 });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: 120 / 110 }]);
  });
});

describe('canvas wheel zoom input', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['pixel', 0, 100, Math.exp(-0.1)],
    ['line', 1, 2, Math.exp(-0.032)],
    ['page', 2, 1, Math.exp(-0.6)],
  ])('normalizes %s wheel deltas to CSS pixels', (_unit, deltaMode, deltaY, scale) => {
    const { dispatchWheel, intents } = setup();

    const event = dispatchWheel({ deltaMode, deltaY });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: expect.closeTo(scale) }]);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('keeps Ctrl-modified trackpad wheel on the same zoom path', () => {
    const { dispatchWheel, intents } = setup();

    const event = dispatchWheel({ deltaY: -50, ctrlKey: true });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: expect.closeTo(Math.exp(0.05)) }]);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    [5000, Math.exp(-1)],
    [-5000, Math.exp(1)],
  ])('clamps a normalized wheel delta of %i CSS pixels before scaling', (deltaY, scale) => {
    const { dispatchWheel, intents } = setup();

    dispatchWheel({ deltaY });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: expect.closeTo(scale) }]);
  });

  it('accepts wheel over plot coordinates without picking the garden', () => {
    const { dispatchWheel, intents, pick } = setup(() => ({ kind: 'plot', plotId: 'plot-2' as PlotId }));

    const event = dispatchWheel({ clientX: 20, clientY: 30 });

    expect(intents).toEqual([{ type: 'ZoomCamera', scale: expect.closeTo(Math.exp(-0.1)) }]);
    expect(pick).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zero', { deltaY: 0 }],
    ['non-finite', { deltaY: Number.NaN }],
    ['positive infinity', { deltaY: Number.POSITIVE_INFINITY }],
    ['negative infinity', { deltaY: Number.NEGATIVE_INFINITY }],
  ] as const)('ignores %s wheel input without preventing the browser default', (_label, init) => {
    const { dispatchWheel, intents } = setup();

    const event = dispatchWheel(init);

    expect(intents).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves UI-origin wheel events untouched', () => {
    const { canvas, dispatchWheel, intents, pick } = setup();

    const event = dispatchWheel({ target: {} as EventTarget });

    expect(intents).toEqual([]);
    expect(pick).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(canvas.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
  });

  it('ignores wheel while a pointer is active and preserves that ground pan sequence', () => {
    const { dispatchWheel, down, intents, move } = setup(() => ({ kind: 'ground' }));

    down({ pointerId: 2, clientX: 20, clientY: 30 });
    const event = dispatchWheel();
    move({ pointerId: 2, clientX: 31, clientY: 30 });

    expect(intents).toEqual([{ type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 }]);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores canvas wheel while a UI-origin pointer is active, then accepts it after pointerup', () => {
    const { dispatchDocument, dispatchWheel, dispatchWindow, intents } = setup();

    dispatchDocument('pointerdown', { pointerId: 20, target: {} as EventTarget });
    const blockedEvent = dispatchWheel();
    expect(intents).toEqual([]);
    expect(blockedEvent.preventDefault).not.toHaveBeenCalled();

    dispatchWindow('pointerup', { pointerId: 20 });
    const acceptedEvent = dispatchWheel();
    expect(intents).toEqual([{ type: 'ZoomCamera', scale: expect.closeTo(Math.exp(-0.1)) }]);
    expect(acceptedEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['right', 2, 2],
    ['middle', 1, 4],
  ] as const)(
    'blocks wheel and gesture input while the %s mouse button is held, then recovers after pointerup',
    (_buttonName, button, buttons) => {
      const { dispatchWindow, dispatchWheel, down, intents, move, up } = setup(() => ({ kind: 'ground' }));

      down({ pointerId: 31, pointerType: 'mouse', button, buttons, clientX: 20, clientY: 30 });
      const blockedWheel = dispatchWheel();
      dispatchWindow('pointermove', {
        pointerId: 31,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 30,
      });
      dispatchWindow('pointerup', {
        pointerId: 31,
        pointerType: 'mouse',
        button,
        buttons: 0,
        target: {} as EventTarget,
      });

      expect(blockedWheel.preventDefault).not.toHaveBeenCalled();
      expect(intents).toEqual([]);

      down({ pointerId: 32, pointerType: 'mouse', button: 0, buttons: 1, clientX: 20, clientY: 30 });
      move({ pointerId: 32, pointerType: 'mouse', clientX: 31, clientY: 30 });
      up({ pointerId: 32, pointerType: 'mouse', button: 0, buttons: 0, clientX: 31, clientY: 30 });
      const acceptedWheel = dispatchWheel();

      expect(intents).toEqual([
        { type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 },
        { type: 'ZoomCamera', scale: expect.closeTo(Math.exp(-0.1)) },
      ]);
      expect(acceptedWheel.preventDefault).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['right', 2, 2],
    ['middle', 1, 4],
  ] as const)(
    'clears blocked %s mouse-button ownership after pointercancel',
    (_buttonName, button, buttons) => {
      const { dispatchWindow, dispatchWheel, down, intents, move, up } = setup(() => ({ kind: 'ground' }));

      down({ pointerId: 41, pointerType: 'mouse', button, buttons, clientX: 20, clientY: 30 });
      const blockedWheel = dispatchWheel();
      dispatchWindow('pointermove', {
        pointerId: 41,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 30,
      });
      dispatchWindow('pointercancel', {
        pointerId: 41,
        pointerType: 'mouse',
        button,
        buttons,
        target: {} as EventTarget,
      });

      expect(blockedWheel.preventDefault).not.toHaveBeenCalled();
      expect(intents).toEqual([]);

      down({ pointerId: 42, pointerType: 'mouse', button: 0, buttons: 1, clientX: 20, clientY: 30 });
      move({ pointerId: 42, pointerType: 'mouse', clientX: 31, clientY: 30 });
      up({ pointerId: 42, pointerType: 'mouse', button: 0, buttons: 0, clientX: 31, clientY: 30 });
      const acceptedWheel = dispatchWheel();

      expect(intents).toEqual([
        { type: 'PanCamera', deltaXCss: 1, deltaYCss: 0 },
        { type: 'ZoomCamera', scale: expect.closeTo(Math.exp(-0.1)) },
      ]);
      expect(acceptedWheel.preventDefault).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores wheel while the owner document is hidden', () => {
    const { dispatchWheel, intents, ownerDocument } = setup();
    Object.defineProperty(ownerDocument, 'hidden', { configurable: true, value: true });

    const event = dispatchWheel();

    expect(intents).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('removes the non-passive wheel listener on disposal and ignores later wheel events', () => {
    const { canvas, dispatchWheel, input, intents, listeners } = setup();
    const wheelListener = listeners.get('wheel')?.values().next().value;
    expect(wheelListener).toBeDefined();
    input.dispose();

    const event = dispatchWheel();

    expect(canvas.removeEventListener).toHaveBeenCalledWith('wheel', wheelListener);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(intents).toEqual([]);
    expect(listeners.get('wheel')?.size).toBe(0);
  });
});
