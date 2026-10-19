import { describe, expect, it, vi } from 'vitest';
import {
  createSwipePathCollector,
  SWIPE_MAX_PLOT_IDS,
  SWIPE_MAX_SAMPLE_GAP_CSS_PX,
  type SwipeCanvasBounds,
} from './swipe';

const bounds: SwipeCanvasBounds = { left: 0, top: 0, right: 100, bottom: 100 };

describe('swipe path collector', () => {
  it('samples a sparse segment in traversal order, including the segment endpoint', () => {
    const sampledXs: number[] = [];
    const pick = vi.fn((x: number) => {
      sampledXs.push(x);
      if (x >= 12 && x < 21) return 'plot-1';
      if (x >= 21 && x < 37) return 'plot-2';
      if (x >= 37) return 'plot-3';
      return null;
    });
    const collector = createSwipePathCollector(bounds, pick, { x: 5, y: 10 }, 'plot-0');

    collector.addPoint({ x: 45, y: 10 });

    expect(collector.finish({ x: 45, y: 10 })).toEqual(['plot-0', 'plot-1', 'plot-2', 'plot-3']);
    expect(sampledXs[0]).toBe(5);
    expect(sampledXs.at(-1)).toBe(45);
    expect(sampledXs.slice(1).every((x, index) => x - sampledXs[index]! <= SWIPE_MAX_SAMPLE_GAP_CSS_PX)).toBe(true);
  });

  it('samples the final pointerup segment and includes its endpoint', () => {
    const pick = vi.fn((x: number) => x >= 30 ? 'plot-final' : null);
    const collector = createSwipePathCollector(bounds, pick, { x: 5, y: 20 }, 'plot-start');
    collector.addPoint({ x: 15, y: 20 });

    expect(collector.finish({ x: 35, y: 20 })).toEqual(['plot-start', 'plot-final']);
    expect(pick).toHaveBeenCalledWith(35, 20);
  });

  it('samples a zero-length final segment with finite coordinates and keeps its endpoint ID', () => {
    const sampledPoints: { x: number; y: number }[] = [];
    const pick = vi.fn((x: number, y: number) => {
      sampledPoints.push({ x, y });
      return x === 40 && y === 50 ? 'plot-end' : null;
    });
    const collector = createSwipePathCollector(bounds, pick, { x: 10, y: 50 });
    collector.addPoint({ x: 40, y: 50 });
    const callsBeforeFinish = pick.mock.calls.length;

    expect(collector.finish({ x: 40, y: 50 })).toEqual(['plot-end']);

    expect(pick.mock.calls.length).toBeGreaterThan(callsBeforeFinish);
    expect(sampledPoints.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(sampledPoints.slice(callsBeforeFinish).every(({ x, y }) => x === 40 && y === 50)).toBe(true);
  });

  it('deduplicates a plot encountered repeatedly across segment crossings', () => {
    const collector = createSwipePathCollector(
      bounds,
      (x) => x < 20 ? 'plot-a' : x < 40 ? 'plot-b' : 'plot-a',
      { x: 5, y: 50 },
    );
    collector.addPoint({ x: 30, y: 50 });
    collector.addPoint({ x: 50, y: 50 });

    expect(collector.finish({ x: 5, y: 50 })).toEqual(['plot-a', 'plot-b']);
  });

  it('keeps crossings recorded before the pointer path passes the tap threshold', () => {
    const collector = createSwipePathCollector(
      bounds,
      (x) => x < 18 ? 'plot-start' : x < 30 ? 'plot-before-threshold' : 'plot-after-threshold',
      { x: 5, y: 10 },
      'plot-start',
    );

    // The pointer adapter feeds every move. The first move is still tap-sized;
    // the next move takes the full path beyond the 10 px tap threshold.
    collector.addPoint({ x: 12, y: 10 });
    collector.addPoint({ x: 40, y: 10 });

    expect(collector.finish({ x: 40, y: 10 })).toEqual([
      'plot-start',
      'plot-before-threshold',
      'plot-after-threshold',
    ]);
  });

  it('never calls the picker with nonfinite coordinates and clips outside points to the canvas', () => {
    const pick = vi.fn((x: number, y: number) => {
      if (y !== 50) return null;
      if (x >= 90) return 'plot-edge';
      return null;
    });
    const collector = createSwipePathCollector(bounds, pick, { x: 10, y: 50 }, 'plot-start');

    collector.addPoint({ x: Number.NaN, y: 50 });
    collector.addPoint({ x: 10, y: Number.POSITIVE_INFINITY });
    collector.addPoint({ x: -1_000_000, y: 50 });
    collector.addPoint({ x: 1_000_000, y: 50 });
    collector.finish({ x: Number.NEGATIVE_INFINITY, y: 50 });

    expect(pick.mock.calls.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(pick.mock.calls.every(([x, y]) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)).toBe(true);
    expect(collector.finish({ x: 10, y: 50 })).toEqual(['plot-start', 'plot-edge']);
  });

  it('caps retained IDs at the six M1 plots', () => {
    let nextPlot = 0;
    const sampledPoints: { x: number; y: number }[] = [];
    const pick = vi.fn((x: number, y: number) => {
      sampledPoints.push({ x, y });
      return `plot-${nextPlot++}`;
    });
    const collector = createSwipePathCollector(bounds, pick, { x: 0, y: 0 }, 'plot-start');

    collector.addPoint({ x: 100, y: 100 });

    const plotIds = collector.finish({ x: 100, y: 100 });
    expect(SWIPE_MAX_PLOT_IDS).toBe(6);
    expect(plotIds).toHaveLength(SWIPE_MAX_PLOT_IDS);
    expect(new Set(plotIds).size).toBe(SWIPE_MAX_PLOT_IDS);
    expect(pick).toHaveBeenCalledTimes(5);
    expect(sampledPoints.every(({ x, y }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)).toBe(true);
  });

  it('bounds segment sampling work to the canvas diagonal even for extreme coordinates', () => {
    const sampledPoints: { x: number; y: number }[] = [];
    const pick = vi.fn((x: number, y: number): null => {
      sampledPoints.push({ x, y });
      return null;
    });
    const collector = createSwipePathCollector(bounds, pick, { x: -10_000, y: 50 });

    collector.addPoint({ x: 10_000, y: 50 });
    collector.finish({ x: 10_000, y: 50 });

    expect(sampledPoints).toHaveLength(pick.mock.calls.length);
    expect(sampledPoints.length).toBeLessThanOrEqual(
      Math.ceil(Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) / SWIPE_MAX_SAMPLE_GAP_CSS_PX) + 1,
    );
    expect(sampledPoints.every(({ x, y }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)).toBe(true);
  });
});
