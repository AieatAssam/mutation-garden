import { expect, test } from '@playwright/test';

interface LifecycleProbe {
  hidden: boolean;
  nowMs: number;
  dateNowCalls: number;
  trackedNowCalls: number;
  countNowCalls: boolean;
  bootDateNowCalls: number;
  requested: number;
  canceled: number;
  nextHandle: number;
  callbacks: Map<number, FrameRequestCallback>;
}

declare global {
  interface Window {
    __gardenLifecycleProbe: LifecycleProbe;
  }
}

test('catches up once and resumes fixed-step frames across visibility changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.addInitScript(() => {
    const probe: LifecycleProbe = {
      hidden: false,
      nowMs: 5_000,
      dateNowCalls: 0,
      trackedNowCalls: 0,
      countNowCalls: false,
      bootDateNowCalls: 0,
      requested: 0,
      canceled: 0,
      nextHandle: 1,
      callbacks: new Map(),
    };
    window.__gardenLifecycleProbe = probe;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => probe.hidden,
    });
    Date.now = () => {
      probe.dateNowCalls += 1;
      if (probe.countNowCalls) probe.trackedNowCalls += 1;
      return probe.nowMs;
    };

    window.requestAnimationFrame = (callback) => {
      probe.requested += 1;
      if (probe.requested === 1) probe.bootDateNowCalls = probe.dateNowCalls;
      const handle = probe.nextHandle++;
      probe.callbacks.set(handle, callback);
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      if (probe.callbacks.delete(handle)) probe.canceled += 1;
    };
  });

  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');

  expect(await page.evaluate(() => ({
    bootDateNowCalls: window.__gardenLifecycleProbe.bootDateNowCalls,
    trackedNowCalls: window.__gardenLifecycleProbe.trackedNowCalls,
    pendingFrames: window.__gardenLifecycleProbe.callbacks.size,
  }))).toEqual({
    bootDateNowCalls: expect.any(Number),
    trackedNowCalls: 0,
    pendingFrames: 1,
  });
  expect(await page.evaluate(() => window.__gardenLifecycleProbe.bootDateNowCalls)).toBeGreaterThan(0);

  const runFrame = (timestampMs: number) => page.evaluate((timestamp) => {
    const probe = window.__gardenLifecycleProbe;
    const [handle, callback] = [...probe.callbacks.entries()][0]!;
    probe.callbacks.delete(handle);
    probe.countNowCalls = true;
    try {
      callback(timestamp);
    } finally {
      probe.countNowCalls = false;
    }
    return {
      trackedNowCalls: probe.trackedNowCalls,
      pendingFrames: probe.callbacks.size,
    };
  }, timestampMs);

  expect(await runFrame(0)).toEqual({ trackedNowCalls: 0, pendingFrames: 1 });
  expect(await runFrame(50)).toEqual({ trackedNowCalls: 0, pendingFrames: 1 });

  await page.evaluate(() => {
    const probe = window.__gardenLifecycleProbe;
    probe.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => ({
    trackedNowCalls: window.__gardenLifecycleProbe.trackedNowCalls,
    pendingFrames: window.__gardenLifecycleProbe.callbacks.size,
    canceled: window.__gardenLifecycleProbe.canceled,
  }))).toEqual({ trackedNowCalls: 0, pendingFrames: 0, canceled: 1 });

  await page.evaluate(() => {
    const probe = window.__gardenLifecycleProbe;
    probe.nowMs = 10_000;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => ({
    trackedNowCalls: window.__gardenLifecycleProbe.trackedNowCalls,
    pendingFrames: window.__gardenLifecycleProbe.callbacks.size,
  }))).toEqual({ trackedNowCalls: 0, pendingFrames: 0 });

  await page.evaluate(() => {
    const probe = window.__gardenLifecycleProbe;
    probe.hidden = false;
    probe.countNowCalls = true;
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
    } finally {
      probe.countNowCalls = false;
    }
  });
  expect(await page.evaluate(() => ({
    trackedNowCalls: window.__gardenLifecycleProbe.trackedNowCalls,
    pendingFrames: window.__gardenLifecycleProbe.callbacks.size,
    requested: window.__gardenLifecycleProbe.requested,
  }))).toEqual({ trackedNowCalls: 1, pendingFrames: 1, requested: 4 });

  expect(await runFrame(10_000)).toEqual({ trackedNowCalls: 1, pendingFrames: 1 });
  expect(await runFrame(10_099)).toEqual({ trackedNowCalls: 1, pendingFrames: 1 });
  expect(await runFrame(10_100)).toEqual({ trackedNowCalls: 2, pendingFrames: 1 });
  expect(errors).toEqual([]);
});
