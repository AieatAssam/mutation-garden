export type SwipePoint = {
  readonly x: number;
  readonly y: number;
};

export type SwipeCanvasBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type SwipePathCollector<T extends string> = {
  /** Add a received pointer position, sampling the segment from the last one. */
  addPoint(point: SwipePoint): void;
  /** Sample the final segment, including its endpoint, and return crossings. */
  finish(endpoint: SwipePoint): readonly T[];
};

export const SWIPE_MAX_PLOT_IDS = 6;
export const SWIPE_MAX_SAMPLE_GAP_CSS_PX = 8;

function isFinitePoint(point: SwipePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidBounds(bounds: SwipeCanvasBounds): boolean {
  return Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.right)
    && Number.isFinite(bounds.bottom)
    && bounds.right >= bounds.left
    && bounds.bottom >= bounds.top;
}

function isInside(point: SwipePoint, bounds: SwipeCanvasBounds): boolean {
  return point.x >= bounds.left
    && point.x <= bounds.right
    && point.y >= bounds.top
    && point.y <= bounds.bottom;
}

// Clip to the canvas so even extreme outside coordinates need at most one
// canvas diagonal of work. Returned endpoints are the path's canvas crossings.
function clipSegment(
  start: SwipePoint,
  end: SwipePoint,
  bounds: SwipeCanvasBounds,
): readonly [SwipePoint, SwipePoint] | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let enter = 0;
  let leave = 1;
  const edges: readonly [number, number][] = [
    [-dx, start.x - bounds.left],
    [dx, bounds.right - start.x],
    [-dy, start.y - bounds.top],
    [dy, bounds.bottom - start.y],
  ];

  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) enter = Math.max(enter, ratio);
    else leave = Math.min(leave, ratio);
    if (enter > leave) return null;
  }

  const clippedStart = { x: start.x + enter * dx, y: start.y + enter * dy };
  const clippedEnd = { x: start.x + leave * dx, y: start.y + leave * dy };
  return isFinitePoint(clippedStart) && isFinitePoint(clippedEnd)
    ? [clippedStart, clippedEnd]
    : null;
}

export function createSwipePathCollector<T extends string>(
  bounds: SwipeCanvasBounds,
  pick: (x: number, y: number) => T | null,
  start: SwipePoint,
  initialPlotId?: T,
): SwipePathCollector<T> {
  let previous = start;
  let finished = false;
  const plotIds: T[] = [];
  const plotIdSet = new Set<T>();
  const validBounds = isValidBounds(bounds);

  function retain(plotId: T | null): void {
    if (plotId === null || plotIdSet.has(plotId) || plotIds.length >= SWIPE_MAX_PLOT_IDS) return;
    plotIdSet.add(plotId);
    plotIds.push(plotId);
  }

  function sample(point: SwipePoint): void {
    if (!validBounds || !isFinitePoint(point) || !isInside(point, bounds) || plotIds.length >= SWIPE_MAX_PLOT_IDS) return;
    retain(pick(point.x, point.y));
  }

  function addPoint(point: SwipePoint): void {
    if (finished) return;
    if (!validBounds || !isFinitePoint(previous) || !isFinitePoint(point)) {
      previous = point;
      return;
    }
    const segment = clipSegment(previous, point, bounds);
    if (segment) {
      const [from, to] = segment;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const sampleCount = Math.max(1, Math.ceil(distance / SWIPE_MAX_SAMPLE_GAP_CSS_PX));
      for (let index = 0; index <= sampleCount && plotIds.length < SWIPE_MAX_PLOT_IDS; index += 1) {
        const progress = index / sampleCount;
        sample({ x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress });
      }
    }
    previous = point;
  }

  if (initialPlotId !== undefined) retain(initialPlotId);
  else sample(start);

  return {
    addPoint,
    finish(endpoint) {
      if (!finished) {
        addPoint(endpoint);
        finished = true;
      }
      return [...plotIds];
    },
  };
}
