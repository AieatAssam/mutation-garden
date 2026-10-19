// Placeholder boot: clears the canvas to the day sky colour. No game yet (see docs/milestones/M1.md).
import { createRenderer } from '../render/renderer';
import { palette } from '../render/palette';
import { createInitialState, getSnapshot, SPECIES } from '../sim';
import type { GardenSnapshot, SpeciesId } from '../sim';
import { createPointerInput } from '../input/pointer';
import { createGardenUI } from '../ui/garden-ui';
import { createPageLifecycle } from './lifecycle';
import { createFixedStepLoop } from './loop';
import { commandForPlotActivation, createPlotActivationGuard } from './commands';

export function boot(canvas: HTMLCanvasElement): () => void {
  document.body.style.background = palette.environment['sky-day'].horizon;
  const initialState = createInitialState(1, Date.now());
  let selectedSpeciesId: SpeciesId = 'sunny-sprout';
  let coins = initialState.coins;
  let latestSnapshot: GardenSnapshot = getSnapshot(initialState);
  const acceptPlotActivation = createPlotActivationGuard();
  const uiRoot = document.createElement('div');
  uiRoot.dataset.gardenUi = '';
  for (const [name, value] of Object.entries({
    '--mg-ui-panel': palette.ui.panel,
    '--mg-ui-border': palette.ui.border,
    '--mg-ui-text': palette.ui.text,
    '--mg-ui-accent': palette.ui.accent,
    '--mg-ui-accent-pressed': palette.ui['accent-pressed'],
    '--mg-ui-on-accent': palette.ui['text-on-accent'],
    '--mg-ui-misprint': palette.ui['misprint-shadow'],
    '--mg-ui-focus': palette.ui['focus-ring'],
    '--mg-ui-coin-face': palette.ui.coin.face,
    '--mg-ui-coin-rim': palette.ui.coin.rim,
    '--mg-ui-coin-emboss': palette.ui.coin.emboss,
    '--mg-ui-coin-outline': palette.ui.coin.outline,
    '--mg-ui-coin-text': palette.ui['coin-text'],
  })) {
    uiRoot.style.setProperty(name, value);
  }
  document.body.append(uiRoot);
  const gardenUI = createGardenUI(uiRoot, {
    species: SPECIES
      .map(({ id, name }) => ({ id, name })),
    selectedId: selectedSpeciesId,
    coins,
    onSelect: (speciesId) => {
      selectedSpeciesId = speciesId;
      gardenUI.update({ selectedId: selectedSpeciesId, coins });
    },
  });

  let disposed = false;
  const disposeUI = () => {
    if (disposed) return;
    disposed = true;
    gardenUI.dispose();
    uiRoot.remove();
  };

  try {
    const r = createRenderer(canvas);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onResize = () => r.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();

    const loop = createFixedStepLoop({
      initialState,
      nowMs: () => Date.now(),
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      onRender: (frame) => {
        latestSnapshot = frame.current;
        coins = frame.current.coins;
        gardenUI.update({ selectedId: selectedSpeciesId, coins });
        r.render(frame.previous, frame.current, frame.alpha, motion.matches);
      },
    });
    const input = createPointerInput(canvas, r.pick, ({ plotId }) => {
      const command = commandForPlotActivation(latestSnapshot, plotId, selectedSpeciesId);
      if (command && acceptPlotActivation(command, Date.now())) loop.enqueue(command);
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
      cancelGesture: input.cancelGesture,
    });
    lifecycle.start();
    document.body.dataset.boot = 'webgl';
    return () => {
      if (disposed) return;
      disposed = true;
      lifecycle.dispose();
      input.dispose();
      window.removeEventListener('resize', onResize);
      r.dispose();
      gardenUI.dispose();
      uiRoot.remove();
    };
  } catch {
    // WebGL unavailable: the page still loads; M1 adds a proper fallback message.
    document.body.dataset.boot = 'no-webgl';
    return disposeUI;
  }
}
