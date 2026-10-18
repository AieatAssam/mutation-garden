import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlotId } from '../sim';
import { createPointerInput, POINTER_TAP_MOVE_THRESHOLD_CSS_PX, type PickResult } from './pointer';
import type { InputIntent } from './types';

type PointerHandler = (event: PointerEvent) => void;

function createCanvas() {
  const listeners = new Map<string, Set<PointerHandler>>();
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
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const typedListener = listener as PointerHandler;
      const handlers = listeners.get(type) ?? new Set<PointerHandler>();
      handlers.add(typedListener);
      listeners.set(type, handlers);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener as PointerHandler);
    }),
    setPointerCapture: vi.fn((pointerId: number) => { capturedPointers.add(pointerId); }),
    releasePointerCapture: vi.fn((pointerId: number) => { capturedPointers.delete(pointerId); }),
    hasPointerCapture: vi.fn((pointerId: number) => capturedPointers.has(pointerId)),
    ownerDocument,
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
    listeners.get(type)?.forEach((handler) => handler(event));
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
    fallbackListeners.get(type)?.forEach((handler) => handler(event));
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

  return { canvas, defaultView, dispatch, dispatchDocument, dispatchWindow, documentListeners, fallbackListeners, listeners, ownerDocument };
}

function setup(pickResult: (x: number, y: number) => PickResult = () => ({ kind: 'plot', plotId: 'plot-2' as PlotId })) {
  const { canvas, defaultView, dispatch, dispatchDocument, dispatchWindow, documentListeners, fallbackListeners, listeners, ownerDocument } = createCanvas();
  const intents: InputIntent[] = [];
  const pick = vi.fn(pickResult);
  const onIntent = vi.fn((intent: InputIntent) => intents.push(intent));
  const input = createPointerInput(canvas, pick, onIntent);
  const down = (overrides: Partial<PointerEvent> = {}) => dispatch('pointerdown', overrides);
  const move = (overrides: Partial<PointerEvent> = {}) => dispatch('pointermove', overrides);
  const up = (overrides: Partial<PointerEvent> = {}) => dispatch('pointerup', overrides);

  return { canvas, defaultView, dispatch, dispatchDocument, dispatchWindow, documentListeners, down, fallbackListeners, intents, input, listeners, move, onIntent, ownerDocument, pick, up };
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
    expect(ownerDocument.removeEventListener).toHaveBeenCalledTimes(1);
    expect(ownerDocument.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
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
});
