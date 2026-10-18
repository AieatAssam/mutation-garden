import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from './boot';

const { disposeRenderer, resizeRenderer } = vi.hoisted(() => ({
  disposeRenderer: vi.fn(),
  resizeRenderer: vi.fn(),
}));

vi.mock('../render/renderer', () => ({
  createRenderer: () => ({ resize: resizeRenderer, dispose: disposeRenderer }),
}));

describe('boot cleanup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('removes the resize listener and disposes the renderer', () => {
    const windowStub = {
      devicePixelRatio: 1,
      innerWidth: 390,
      innerHeight: 844,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
    };
    const documentStub = {
      body: { style: {}, dataset: {} },
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', windowStub as unknown as Window);
    vi.stubGlobal('document', documentStub as unknown as Document);

    const cleanup = boot({} as HTMLCanvasElement);
    const resizeListener = windowStub.addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1];

    expect(resizeRenderer).toHaveBeenCalledWith(390, 844);
    expect(resizeListener).toBeTypeOf('function');

    cleanup();
    cleanup();

    expect(windowStub.removeEventListener).toHaveBeenCalledWith('resize', resizeListener);
    expect(windowStub.removeEventListener.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    expect(disposeRenderer).toHaveBeenCalledTimes(1);
  });
});
