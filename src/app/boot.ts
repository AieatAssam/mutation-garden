// Placeholder boot: clears the canvas to the day sky colour. No game yet (see docs/milestones/M1.md).
import { createRenderer } from '../render/renderer';
import { palette } from '../render/palette';

export function boot(canvas: HTMLCanvasElement): void {
  document.body.style.background = palette.environment['sky-day'].horizon;
  try {
    const r = createRenderer(canvas);
    const onResize = () => r.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();
    document.body.dataset.boot = 'webgl';
  } catch {
    // WebGL unavailable: the page still loads; M1 adds a proper fallback message.
    document.body.dataset.boot = 'no-webgl';
  }
}
