// Placeholder boot: clears the canvas to the day sky colour. No game yet (see docs/milestones/M1.md).
import { createRenderer } from '../render/renderer';
import { palette } from '../render/palette';
import { createInitialState } from '../sim';
import { createFixedStepLoop } from './loop';

export function boot(canvas: HTMLCanvasElement): void {
  document.body.style.background = palette.environment['sky-day'].horizon;
  try {
    const r = createRenderer(canvas);
    const onResize = () => r.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();

    const loop = createFixedStepLoop({
      initialState: createInitialState(1, Date.now()),
      nowMs: () => Date.now(),
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      // Snapshot rendering is connected when the garden renderer is introduced.
      onRender: () => undefined,
    });
    loop.start();
    document.body.dataset.boot = 'webgl';
  } catch {
    // WebGL unavailable: the page still loads; M1 adds a proper fallback message.
    document.body.dataset.boot = 'no-webgl';
  }
}
