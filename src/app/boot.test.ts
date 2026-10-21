import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getSnapshot, step, type GardenSnapshot } from '../sim';
import * as loopModule from './loop';
import { boot } from './boot';

const {
  createRenderer,
  disposeRenderer, resizeRenderer, panRenderer, zoomRenderer, renderRenderer, pickRenderer,
  createGardenUI, updateGardenUI, disposeGardenUI, createPointerInput,
} = vi.hoisted(() => ({
  createRenderer: vi.fn(),
  disposeRenderer: vi.fn(), resizeRenderer: vi.fn(), panRenderer: vi.fn(), zoomRenderer: vi.fn(), renderRenderer: vi.fn(),
  pickRenderer: vi.fn(() => null),
  createGardenUI: vi.fn(), updateGardenUI: vi.fn(), disposeGardenUI: vi.fn(),
  createPointerInput: vi.fn(),
}));
vi.mock('../render/renderer', () => ({ createRenderer: (...args: unknown[]) => {
  createRenderer(...args);
  return { resize: resizeRenderer, pan: panRenderer, zoom: zoomRenderer, render: renderRenderer, pick: pickRenderer,
    whenLoaded: () => new Promise<void>(() => {}), dispose: disposeRenderer };
} }));
vi.mock('../input/pointer', () => ({
  createPointerInput: (canvas: HTMLCanvasElement, pick: unknown, onIntent: unknown) =>
    createPointerInput(canvas, pick, onIntent),
}));
vi.mock('../ui/garden-ui', () => ({
  createGardenUI: (container: HTMLElement, options: unknown) => createGardenUI(container, options),
}));

describe('boot animation wiring', () => {
  beforeEach(() => {
    createRenderer.mockReset();
    createPointerInput.mockReset().mockReturnValue({ cancelGesture: vi.fn(), dispose: vi.fn() });
    pickRenderer.mockReset().mockReturnValue(null);
    panRenderer.mockReset();
    zoomRenderer.mockReset();
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
    const onIntent = createPointerInput.mock.calls[0]![2] as (intent: import('../input/types').InputIntent) => void;

    onIntent({ type: 'PanCamera', deltaXCss: 12, deltaYCss: -7 });
    expect(panRenderer).toHaveBeenCalledTimes(1);
    expect(panRenderer).toHaveBeenLastCalledWith(12, -7);
    expect(enqueue).not.toHaveBeenCalled();

    onIntent({ type: 'ZoomCamera', scale: 1.275 });
    expect(zoomRenderer).toHaveBeenCalledTimes(1);
    expect(zoomRenderer).toHaveBeenCalledWith(1.275);
    expect(enqueue).not.toHaveBeenCalled();

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

  it('queues one ordered swipe batch and guards every batch target against immediate replanting', () => {
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
    const now = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
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
    expect(createRenderer).toHaveBeenCalledWith(expect.anything(), {
      species: [
        { id: 'sunny-sprout', stageFractions: [0.125, 0.375, 0.875] },
        { id: 'bubble-berry', stageFractions: [2 / 15, 0.4, 13 / 15] },
        { id: 'twistroot', stageFractions: [0.12, 0.4, 0.88] },
      ],
    });
    const onIntent = createPointerInput.mock.calls[0]![2] as (intent: import('../input/types').InputIntent) => void;
    const planted = getSnapshot(step(createInitialState(1, 1_000), [
      { type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' },
      { type: 'Plant', plotId: 'plot-2', seedId: 'sunny-sprout' },
    ], 1_000).state);
    onRender!({ previous: planted, current: planted, alpha: 0 });

    nowMs = 1_001;
    onIntent({ type: 'HarvestPlots', plotIds: ['plot-2', 'plot-0', 'plot-2', 'unknown-plot' as import('../sim').PlotId] });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ type: 'Harvest', plotIds: ['plot-2', 'plot-0'] });
    expect(now).toHaveBeenCalledTimes(2); // Initial state plus one guard timestamp for the entire batch.

    nowMs = 1_002;
    const empty = getSnapshot(createInitialState(1, 1_000));
    onRender!({ previous: planted, current: empty, alpha: 0 });
    onIntent({ type: 'ActivatePlot', plotId: 'plot-0' });
    onIntent({ type: 'ActivatePlot', plotId: 'plot-2' });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'Plant' }));

    cleanup();
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
      species: [
        { id: 'sunny-sprout', name: 'Sunny Sprout' },
        { id: 'bubble-berry', name: 'Bubble Berry' },
        { id: 'twistroot', name: 'Twistroot' },
      ],
      selectedId: 'sunny-sprout',
      coins: 12,
      onSelect: expect.any(Function),
    }));
    expect(documentStub.body.append).toHaveBeenCalledWith(uiRoot);
    const uiOptions = createGardenUI.mock.calls[0]![1] as {
      onSelect: (id: 'sunny-sprout' | 'bubble-berry' | 'twistroot') => void;
    };
    uiOptions.onSelect('bubble-berry');
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'bubble-berry', coins: 12 });
    uiOptions.onSelect('twistroot');
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'twistroot', coins: 12 });
    const resizeListener = windowStub.addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1] as () => void;
    expect(resizeRenderer).toHaveBeenLastCalledWith(390, 844); windowStub.innerWidth = 800; windowStub.innerHeight = 600; resizeListener();
    expect(resizeRenderer).toHaveBeenLastCalledWith(800, 600); expect(windowStub.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(frame).toBeTypeOf('function'); frame!(0); const nextFrame = frame!; nextFrame(216);
    const [previous, current, alpha, motion] = renderRenderer.mock.calls[0]!;
    expect(previous).toBe(current); expect((current as GardenSnapshot).plots).toHaveLength(6); expect(alpha).toBe(0); expect(motion).toBe(true);
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'twistroot', coins: 12 });
    const [prior, latest, blend, moving] = renderRenderer.mock.calls[1]!;
    expect(prior).not.toBe(latest); expect((prior as GardenSnapshot).nowMs).toBe(1_100); expect((latest as GardenSnapshot).nowMs).toBe(1_200);
    expect(updateGardenUI).toHaveBeenLastCalledWith({ selectedId: 'twistroot', coins: 12 });
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
