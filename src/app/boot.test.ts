import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GardenSnapshot } from '../sim';
import { boot } from './boot';

const { disposeRenderer, resizeRenderer, renderRenderer } = vi.hoisted(() => ({
  disposeRenderer: vi.fn(), resizeRenderer: vi.fn(), renderRenderer: vi.fn(),
}));
vi.mock('../render/renderer', () => ({ createRenderer: () => ({ resize: resizeRenderer, render: renderRenderer, dispose: disposeRenderer }) }));

describe('boot animation wiring', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });
  it('forwards the first snapshot and motion preference, resizes, cancels and cleans up once', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100).mockReturnValueOnce(1_200);
    let frame: ((timestamp: number) => void) | undefined; let reduced = true;
    const windowStub = {
      devicePixelRatio: 1, innerWidth: 390, innerHeight: 844, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn((callback: (timestamp: number) => void) => { frame = callback; return 37; }),
      cancelAnimationFrame: vi.fn(), matchMedia: vi.fn(() => ({ get matches() { return reduced; } })),
    };
    const documentStub = { body: { style: {}, dataset: {} }, hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('window', windowStub as unknown as Window); vi.stubGlobal('document', documentStub as unknown as Document);
    const cleanup = boot({} as HTMLCanvasElement);
    const resizeListener = windowStub.addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1] as () => void;
    expect(resizeRenderer).toHaveBeenLastCalledWith(390, 844); windowStub.innerWidth = 800; windowStub.innerHeight = 600; resizeListener();
    expect(resizeRenderer).toHaveBeenLastCalledWith(800, 600); expect(windowStub.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(frame).toBeTypeOf('function'); frame!(0); const nextFrame = frame!; nextFrame(216);
    const [previous, current, alpha, motion] = renderRenderer.mock.calls[0]!;
    expect(previous).toBe(current); expect((current as GardenSnapshot).plots).toHaveLength(6); expect(alpha).toBe(0); expect(motion).toBe(true);
    const [prior, latest, blend, moving] = renderRenderer.mock.calls[1]!;
    expect(prior).not.toBe(latest); expect((prior as GardenSnapshot).nowMs).toBe(1_100); expect((latest as GardenSnapshot).nowMs).toBe(1_200);
    expect(blend).toBeCloseTo(0.16); expect(moving).toBe(true);
    reduced = false; frame!(232); expect(renderRenderer.mock.calls[2]![3]).toBe(false);
    cleanup(); cleanup();
    expect(windowStub.cancelAnimationFrame).toHaveBeenCalledTimes(1); expect(windowStub.cancelAnimationFrame).toHaveBeenCalledWith(37);
    expect(windowStub.removeEventListener).toHaveBeenCalledWith('resize', resizeListener); expect(disposeRenderer).toHaveBeenCalledTimes(1);
  });
});
