import type { FixedStepLoop } from './loop';

export interface PageLifecycleOptions {
  readonly loop: FixedStepLoop;
  readonly isHidden: () => boolean;
  readonly subscribeVisibility: (listener: () => void) => () => void;
  readonly subscribePageHide: (listener: () => void) => () => void;
  readonly subscribePageShow: (listener: () => void) => () => void;
  readonly cancelGesture: () => void;
  readonly beforeSuspend?: () => void;
  readonly beforeResume?: () => void;
  readonly afterResume?: () => void;
}

export interface PageLifecycle {
  start(): void;
  dispose(): void;
}

/** Pause the app loop while the page is away and advance timestamps once on return. */
export function createPageLifecycle(options: PageLifecycleOptions): PageLifecycle {
  let started = false;
  let suspended = false;
  let pageHidden = false;
  let unsubscribe: (() => void)[] = [];

  const suspend = (prepare = true) => {
    if (suspended) return;
    suspended = true;
    if (prepare) options.beforeSuspend?.();
    options.loop.stop();
    options.cancelGesture();
  };

  const resume = () => {
    if (!suspended || pageHidden || options.isHidden()) return;
    options.beforeResume?.();
    options.loop.catchUp();
    options.afterResume?.();
    suspended = false;
    options.loop.start();
  };

  return {
    start() {
      if (started) return;
      started = true;
      unsubscribe = [
        options.subscribeVisibility(() => {
          if (options.isHidden()) suspend();
          else resume();
        }),
        options.subscribePageHide(() => {
          pageHidden = true;
          suspend();
        }),
        options.subscribePageShow(() => {
          pageHidden = false;
          resume();
        }),
      ];

      if (options.isHidden()) suspend();
      else options.loop.start();
    },
    dispose() {
      if (!started) return;
      started = false;
      for (const stopListening of unsubscribe) stopListening();
      unsubscribe = [];
      suspend(false);
    },
  };
}
