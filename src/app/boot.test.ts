import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getSnapshot, step, type GardenSnapshot } from '../sim';
import * as loopModule from './loop';
import { boot } from './boot';

const {
  disposeRenderer, resizeRenderer, renderRenderer, pickRenderer,
  createGardenUI, updateGardenUI, disposeGardenUI, createPointerInput,
} = vi.hoisted(() => ({
  disposeRenderer: vi.fn(), resizeRenderer: vi.fn(), renderRenderer: vi.fn(),
  pickRenderer: vi.fn(() => null),
  createGardenUI: vi.fn(), updateGardenUI: vi.fn(), disposeGardenUI: vi.fn(),
  createPointerInput: vi.fn(),
}));
vi.mock('../render/renderer', () => ({ createRenderer: () => ({ resize: resizeRenderer, render: renderRenderer, pick: pickRenderer, dispose: disposeRenderer }) }));
vi.mock('../input/pointer', () => ({
  createPointerInput: (canvas: HTMLCanvasElement, pick: unknown, onIntent: unknown) =>
    createPointerInput(canvas, pick, onIntent),
}));
vi.mock('../ui/garden-ui', () => ({
  createGardenUI: (container: HTMLElement, options: unknown) => createGardenUI(container, options),
}));

describe('boot animation wiring', () => {
  beforeEach(() => {
    createPointerInput.mockReset().mockReturnValue({ cancelGesture: vi.fn(), dispose: vi.fn() });
    pickRenderer.mockReset().mockReturnValue(null);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('maps plot activations from the latest snapshot and enqueues each resulting command', () => {
    createGardenUI.mockReturnValue({ update: updateGardenUI, dispose: disposeGardenUI });
    let onRender: ((frame: { previous: GardenSnapshot; current: GardenSnapshot; alpha: number }) => void) | undefined;
    const enqueue = vi.fn();
    vi.spyOn(loopModule, 'createFixedStepLoop').mockImplementation((options) => {
      onRender = options.onRender;
      return { enqueue, catchUp: vi.fn(), stop: vi.fn(), start: vi.fn() };
    });
    const pointerInput = { cancelGesture: vi.fn(), dispose: vi.fn() };
    createPointerInput.mockReturnValue(pointerInput);
    let nowMs = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const windowStub = {
      innerWidth: 390, innerHeight: 844, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false })),
    };
    const uiRoot = { dataset: {}, style: { setProperty: vi.fn() }, remove: vi.fn() };
    const documentStub = {
      body: { style: {}, dataset: {}, append: vi.fn() }, hidden: false,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), createElement: vi.fn(() => uiRoot),
    };
    vi.stubGlobal('window', windowStub as unknown as Window);
    vi.stubGlobal('document', documentStub as unknown as Document);
    const canvas = {} as HTMLCanvasElement;

    const cleanup = boot(canvas);
    expect(createPointerInput).toHaveBeenCalledWith(canvas, pickRenderer, expect.any(Function));
    const onIntent = createPointerInput.mock.calls[0]![2] as (intent: { type: 'ActivatePlot'; plotId: string }) => void;

    onIntent({ type: 'ActivatePlot', plotId: 'plot-0' });
    expect(enqueue).toHaveBeenLastCalledWith({ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' });

    const plantedState = step(
      createInitialState(1, 1_000),
      [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }],
      1_000,
    ).state;
    const planted = getSnapshot(plantedState);
    onRender!({ previous: planted, current: planted, alpha: 0 });
    nowMs = 1_001;
    onIntent({ type: 'ActivatePlot', plotId: 'plot-0' });
    expect(enqueue).toHaveBeenLastCalledWith({ type: 'Harvest', plotIds: ['plot-0'] });
    expect(enqueue).toHaveBeenCalledTimes(2);

    const empty = getSnapshot(createInitialState(1, 1_000));
    onRender!({ previous: empty, current: empty, alpha: 0 });
    nowMs = 3_500;
    onIntent({ type: 'ActivatePlot', plotId: 'plot-0' });
    expect(enqueue).toHaveBeenCalledTimes(2);

    nowMs = 3_501;
    onIntent({ type: 'ActivatePlot', plotId: 'plot-0' });
    expect(enqueue).toHaveBeenLastCalledWith({ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' });
    expect(enqueue).toHaveBeenCalledTimes(3);

    cleanup();
    expect(pointerInput.dispose).toHaveBeenCalledTimes(1);
  });

  it('forwards the first snapshot and motion preference, resizes, cancels and cleans up once', () => {
    createGardenUI.mockReturnValue({ update: updateGardenUI, dispose: disposeGardenUI });
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100).mockReturnValueOnce(1_200);
    let frame: ((timestamp: number) => void) | undefined; let reduced = true;
    const windowStub = {
      devicePixelRatio: 1, innerWidth: 390, innerHeight: 844, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn((callback: (timestamp: number) => void) => { frame = callback; return 37; }),
      cancelAnimationFrame: vi.fn(), matchMedia: vi.fn(() => ({ get matches() { return reduced; } })),
    };
    const uiRoot = { dataset: {}, style: { setProperty: vi.fn() }, remove: vi.fn() };
    const documentStub = {
      body: { style: {}, dataset: {}, append: vi.fn() }, hidden: false,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), createElement: vi.fn(() => uiRoot),
    };
    vi.stubGlobal('window', windowStub as unknown as Window); vi.stubGlobal('document', documentStub as unknown as Document);
    const cleanup = boot({} as HTMLCanvasElement);
    expect(createGardenUI).toHaveBeenCalledWith(uiRoot, expect.objectContaining({
      species: [{ id: 'sunny-sprout', name: 'Sunny Sprout' }],
      selectedId: 'sunny-sprout',
      coins: 12,
      onSelect: expect.any(Function),
    }));
    expect(documentStub.body.append).toHaveBeenCalledWith(uiRoot);
    const uiOptions = createGardenUI.mock.calls[0]![1] as {
      onSelect: (id: 'sunny-sprout') => void;
    };
    uiOptions.onSelect('sunny-sprout');
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'sunny-sprout', coins: 12 });
    const resizeListener = windowStub.addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1] as () => void;
    expect(resizeRenderer).toHaveBeenLastCalledWith(390, 844); windowStub.innerWidth = 800; windowStub.innerHeight = 600; resizeListener();
    expect(resizeRenderer).toHaveBeenLastCalledWith(800, 600); expect(windowStub.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(frame).toBeTypeOf('function'); frame!(0); const nextFrame = frame!; nextFrame(216);
    const [previous, current, alpha, motion] = renderRenderer.mock.calls[0]!;
    expect(previous).toBe(current); expect((current as GardenSnapshot).plots).toHaveLength(6); expect(alpha).toBe(0); expect(motion).toBe(true);
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'sunny-sprout', coins: 12 });
    const [prior, latest, blend, moving] = renderRenderer.mock.calls[1]!;
    expect(prior).not.toBe(latest); expect((prior as GardenSnapshot).nowMs).toBe(1_100); expect((latest as GardenSnapshot).nowMs).toBe(1_200);
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'sunny-sprout', coins: 12 });
    expect(blend).toBeCloseTo(0.16); expect(moving).toBe(true);
    reduced = false; frame!(232); expect(renderRenderer.mock.calls[2]![3]).toBe(false);
    cleanup(); cleanup();
    expect(windowStub.cancelAnimationFrame).toHaveBeenCalledTimes(1); expect(windowStub.cancelAnimationFrame).toHaveBeenCalledWith(37);
    expect(windowStub.removeEventListener).toHaveBeenCalledWith('resize', resizeListener); expect(disposeRenderer).toHaveBeenCalledTimes(1);
    expect(disposeGardenUI).toHaveBeenCalledTimes(1); expect(uiRoot.remove).toHaveBeenCalledTimes(1);
  });

  it('forwards a later snapshot coin total without reusing the initial balance', () => {
    createGardenUI.mockReturnValue({ update: updateGardenUI, dispose: disposeGardenUI });
    const initial: GardenSnapshot = { coins: 12, nowMs: 1_000, plots: [] };
    const later: GardenSnapshot = { ...initial, coins: 7, nowMs: 1_100 };
    vi.spyOn(loopModule, 'createFixedStepLoop').mockImplementation((options) => ({
      enqueue: vi.fn(), catchUp: vi.fn(), stop: vi.fn(),
      start() {
        options.onRender({ previous: initial, current: initial, alpha: 0 });
        options.onRender({ previous: initial, current: later, alpha: 0 });
      },
    }));
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const windowStub = {
      innerWidth: 390, innerHeight: 844, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false })),
    };
    const uiRoot = { dataset: {}, style: { setProperty: vi.fn() }, remove: vi.fn() };
    const documentStub = {
      body: { style: {}, dataset: {}, append: vi.fn() }, hidden: false,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), createElement: vi.fn(() => uiRoot),
    };
    vi.stubGlobal('window', windowStub as unknown as Window);
    vi.stubGlobal('document', documentStub as unknown as Document);

    const cleanup = boot({} as HTMLCanvasElement);

    expect(createGardenUI).toHaveBeenCalledWith(uiRoot, expect.objectContaining({ coins: 12 }));
    expect(updateGardenUI.mock.calls.map(([update]) => update)).toEqual([
      { selectedId: 'sunny-sprout', coins: 12 },
      { selectedId: 'sunny-sprout', coins: 7 },
    ]);
    cleanup();
  });
});
