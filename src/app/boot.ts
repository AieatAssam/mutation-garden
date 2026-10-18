// Placeholder boot: clears the canvas to the day sky colour. No game yet (see docs/milestones/M1.md).
import { createRenderer } from '../render/renderer';
import { palette } from '../render/palette';
import { createInitialState } from '../sim';
import { createPageLifecycle } from './lifecycle';
import { createFixedStepLoop } from './loop';

export function boot(canvas: HTMLCanvasElement): () => void {
  document.body.style.background = palette.environment['sky-day'].horizon;
  try {
    const r = createRenderer(canvas);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onResize = () => r.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();

    const loop = createFixedStepLoop({
      initialState: createInitialState(1, Date.now()),
      nowMs: () => Date.now(),
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      onRender: (frame) => r.render(frame.previous, frame.current, frame.alpha, motion.matches),
    });
    const lifecycle = createPageLifecycle({
      loop,
      isHidden: () => document.hidden,
      subscribeVisibility: (listener) => {
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
      },
      subscribePageHide: (listener) => {
        window.addEventListener('pagehide', listener);
        return () => window.removeEventListener('pagehide', listener);
      },
      subscribePageShow: (listener) => {
        window.addEventListener('pageshow', listener);
        return () => window.removeEventListener('pageshow', listener);
      },
      // Input wiring supplies gesture cancellation when plot gestures are added.
      cancelGesture: () => undefined,
    });
    lifecycle.start();
    document.body.dataset.boot = 'webgl';
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      lifecycle.dispose();
      window.removeEventListener('resize', onResize);
      r.dispose();
    };
  } catch {
    // WebGL unavailable: the page still loads; M1 adds a proper fallback message.
    document.body.dataset.boot = 'no-webgl';
    return () => undefined;
  }
}
