import type { PlotId } from '../sim';
import type { InputIntent } from './types';
import { createSwipePathCollector, type SwipeCanvasBounds, type SwipePathCollector } from './swipe';

export type PickResult =
  | { readonly kind: 'plot'; readonly plotId: PlotId }
  | { readonly kind: 'ground' }
  | null;

export const POINTER_TAP_MOVE_THRESHOLD_CSS_PX = 10;

type PointerTrack = {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly origin: 'canvas' | 'outside';
  readonly startKind: 'plot' | 'ground' | 'miss' | 'ui';
  readonly plotId: PlotId | null;
  x: number;
  y: number;
};

type Gesture = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startKind: PointerTrack['startKind'];
  readonly plotId: PlotId | null;
  readonly swipeBounds: SwipeCanvasBounds | null;
  readonly swipeCollector: SwipePathCollector<PlotId> | null;
  panning: boolean;
  panOffsetX: number;
  panOffsetY: number;
  cancelled: boolean;
  swiping: boolean;
};

type Pinch = {
  readonly pointerIds: readonly [number, number];
  previousDistance: number;
  crossedDeadZone: boolean;
};

export type PointerInput = {
  cancelGesture(): void;
  dispose(): void;
};

export function createPointerInput(
  canvas: HTMLCanvasElement,
  pick: (clientX: number, clientY: number) => PickResult,
  onIntent: (intent: InputIntent) => void,
): PointerInput {
  let gesture: Gesture | null = null;
  let pinch: Pinch | null = null;
  let sequenceBlocked = false;
  const pointersDown = new Map<number, PointerTrack>();
  const externalPointersDown = new Set<number>();
  let fallbackTarget: EventTarget | null = null;
  let disposed = false;

  function readCanvasBounds(): SwipeCanvasBounds | null {
    const rect = canvas.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)
      || !Number.isFinite(rect.right) || !Number.isFinite(rect.bottom)
      || rect.right < rect.left || rect.bottom < rect.top) return null;
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }

  function sameBounds(first: SwipeCanvasBounds, second: SwipeCanvasBounds | null): boolean {
    return second !== null && first.left === second.left && first.top === second.top
      && first.right === second.right && first.bottom === second.bottom;
  }

  function isInsideBounds(bounds: SwipeCanvasBounds, x: number, y: number): boolean {
    return Number.isFinite(x) && Number.isFinite(y)
      && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  function releaseCapture(pointerId: number): void {
    if (!canvas.hasPointerCapture(pointerId)) return;
    try {
      canvas.releasePointerCapture(pointerId);
    } catch {
      // Capture may have been released by the browser between the check and call.
    }
  }

  function removeFallbackListeners(): void {
    if (!fallbackTarget) return;
    fallbackTarget.removeEventListener('pointermove', fallbackMoveListener);
    fallbackTarget.removeEventListener('pointerup', fallbackUpListener);
    fallbackTarget.removeEventListener('pointercancel', fallbackCancelListener);
    fallbackTarget = null;
  }

  function addFallbackListeners(): void {
    const ownerDocument = canvas.ownerDocument;
    fallbackTarget = ownerDocument?.defaultView ?? ownerDocument ?? null;
    if (!fallbackTarget) return;
    fallbackTarget.addEventListener('pointermove', fallbackMoveListener);
    fallbackTarget.addEventListener('pointerup', fallbackUpListener);
    fallbackTarget.addEventListener('pointercancel', fallbackCancelListener);
  }

  function cancelActiveSequence(releaseCaptures = false): void {
    const pointerIds = releaseCaptures ? [...pointersDown.keys()] : [];
    gesture = null;
    pinch = null;
    sequenceBlocked = pointersDown.size > 0;
    if (pointersDown.size > 0 && !fallbackTarget) addFallbackListeners();
    if (pointersDown.size === 0) removeFallbackListeners();
    // End internal ownership before release; lostpointercapture can be synchronous.
    for (const pointerId of pointerIds) releaseCapture(pointerId);
  }

  function trackPointer(event: PointerEvent, origin: PointerTrack['origin'], result: PickResult): PointerTrack {
    const track: PointerTrack = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      origin,
      startKind: origin === 'outside' ? 'ui' : result?.kind ?? 'miss',
      plotId: result?.kind === 'plot' ? result.plotId : null,
      x: event.clientX,
      y: event.clientY,
    };
    pointersDown.set(event.pointerId, track);
    return track;
  }

  function capturePointer(pointerId: number): void {
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      // Fallback listeners preserve the sequence when capture is unavailable.
      addFallbackListeners();
    }
  }

  function moveGesture(current: Gesture, clientX: number, clientY: number, sampleSwipePath = true): void {
    const bounds = current.swipeBounds;
    if (current.startKind === 'plot' && bounds
      && (!sameBounds(bounds, readCanvasBounds()) || !isInsideBounds(bounds, clientX, clientY))) {
      current.cancelled = true;
    }
    if (sampleSwipePath && !current.cancelled) current.swipeCollector?.addPoint({ x: clientX, y: clientY });
    const distanceX = clientX - current.startX;
    const distanceY = clientY - current.startY;
    const distance = Math.hypot(distanceX, distanceY);

    if (!current.cancelled && !current.panning && !current.swiping
      && distance > POINTER_TAP_MOVE_THRESHOLD_CSS_PX) {
      if (current.startKind === 'ground') current.panning = true;
      else if (current.startKind === 'plot') current.swiping = true;
      else current.cancelled = true;
    }

    if (current.panning) {
      const beyondThreshold = Math.max(0, distance - POINTER_TAP_MOVE_THRESHOLD_CSS_PX);
      const desiredX = distance === 0 ? 0 : distanceX * beyondThreshold / distance;
      const desiredY = distance === 0 ? 0 : distanceY * beyondThreshold / distance;
      const deltaXCss = desiredX - current.panOffsetX;
      const deltaYCss = desiredY - current.panOffsetY;
      // Advance the desired pan baseline even if the renderer clamps the pan.
      current.panOffsetX = desiredX;
      current.panOffsetY = desiredY;
      if (deltaXCss !== 0 || deltaYCss !== 0) {
        onIntent({ type: 'PanCamera', deltaXCss, deltaYCss });
      }
    }
  }

  function movePinch(): void {
    const current = pinch;
    if (!current || sequenceBlocked) return;
    const first = pointersDown.get(current.pointerIds[0]);
    const second = pointersDown.get(current.pointerIds[1]);
    if (!first || !second) return;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    if (!Number.isFinite(distance) || distance <= 0) return;

    if (!current.crossedDeadZone) {
      const delta = distance - current.previousDistance;
      if (Math.abs(delta) <= POINTER_TAP_MOVE_THRESHOLD_CSS_PX) return;
      const thresholdDistance = current.previousDistance + Math.sign(delta) * POINTER_TAP_MOVE_THRESHOLD_CSS_PX;
      const scale = distance / thresholdDistance;
      current.previousDistance = distance;
      current.crossedDeadZone = true;
      if (Number.isFinite(scale) && scale > 0 && scale !== 1) onIntent({ type: 'ZoomCamera', scale });
      return;
    }

    const scale = distance / current.previousDistance;
    current.previousDistance = distance;
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) onIntent({ type: 'ZoomCamera', scale });
  }

  function finishPointer(event: PointerEvent, cancelled: boolean): void {
    const track = pointersDown.get(event.pointerId);
    if (!track) return;
    if (pinch?.pointerIds.includes(event.pointerId) && !cancelled && !sequenceBlocked) {
      track.x = event.clientX;
      track.y = event.clientY;
      movePinch();
    }
    if (gesture?.pointerId === event.pointerId && !cancelled && !sequenceBlocked) {
      moveGesture(gesture, event.clientX, event.clientY, false);
      let intent: InputIntent | null = null;
      if (!gesture.cancelled && event.target === canvas) {
        if (gesture.swiping && gesture.swipeCollector) {
          const plotIds = gesture.swipeCollector.finish({ x: event.clientX, y: event.clientY });
          if (plotIds.length > 0) intent = { type: 'HarvestPlots', plotIds };
        } else if (!gesture.swiping && gesture.plotId !== null) {
          intent = { type: 'ActivatePlot', plotId: gesture.plotId };
        }
      }
      gesture = null;
      pointersDown.delete(event.pointerId);
      if (pointersDown.size === 0) sequenceBlocked = false;
      releaseCapture(event.pointerId);
      if (intent) onIntent(intent);
      if (pointersDown.size === 0) removeFallbackListeners();
      return;
    }

    if (pinch?.pointerIds.includes(event.pointerId)) {
      // Either lift ends the pair. The remaining finger cannot pan or tap.
      pinch = null;
      sequenceBlocked = true;
    }
    pointersDown.delete(event.pointerId);
    if (pointersDown.size === 0) {
      gesture = null;
      pinch = null;
      sequenceBlocked = false;
      removeFallbackListeners();
    }
    releaseCapture(event.pointerId);
  }

  function onPointerDown(event: PointerEvent): void {
    if (disposed || event.target !== canvas || pointersDown.has(event.pointerId)) return;

    if (externalPointersDown.size > 0) {
      // A UI contact owns the sequence. Remember this canvas contact so a later
      // lift cannot turn the remaining finger into a fresh gesture.
      trackPointer(event, 'canvas', null);
      sequenceBlocked = true;
      addFallbackListeners();
      return;
    }

    if (pointersDown.size === 0) {
      if (!event.isPrimary || event.button !== 0) {
        // A rejected button still owns this contact until it ends. That keeps
        // wheel zoom and any later contacts from becoming gestures mid-hold.
        trackPointer(event, 'canvas', null);
        sequenceBlocked = true;
        addFallbackListeners();
        return;
      }
      const result = pick(event.clientX, event.clientY);
      const track = trackPointer(event, 'canvas', result);
      const swipeBounds = track.startKind === 'plot' ? readCanvasBounds() : null;
      const swipeCollector = swipeBounds && track.plotId !== null
        ? createSwipePathCollector<PlotId>(
          swipeBounds,
          (x, y) => {
            const hit = pick(x, y);
            return hit?.kind === 'plot' ? hit.plotId : null;
          },
          { x: event.clientX, y: event.clientY },
          track.plotId,
        )
        : null;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startKind: track.startKind,
        plotId: track.plotId,
        swipeBounds,
        swipeCollector,
        panning: false,
        panOffsetX: 0,
        panOffsetY: 0,
        cancelled: false,
        swiping: false,
      };
      sequenceBlocked = false;
      capturePointer(event.pointerId);
      return;
    }

    const result = pick(event.clientX, event.clientY);
    const second = trackPointer(event, 'canvas', result);
    capturePointer(event.pointerId);
    if (pointersDown.size === 2 && !sequenceBlocked) {
      const [first] = [...pointersDown.values()];
      gesture = null;
      if (first && first.pointerType === 'touch' && second.pointerType === 'touch'
        && first.origin === 'canvas' && second.origin === 'canvas'
        && first.startKind === 'ground' && second.startKind === 'ground') {
        const baseline = Math.hypot(second.x - first.x, second.y - first.y);
        pinch = baseline > 0
          ? { pointerIds: [first.pointerId, second.pointerId], previousDistance: baseline, crossedDeadZone: false }
          : null;
        if (!pinch) sequenceBlocked = true;
      } else {
        pinch = null;
        sequenceBlocked = true;
      }
    } else {
      pinch = null;
      sequenceBlocked = true;
    }
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    // Capture phase runs before the canvas target handler. Canvas contacts must
    // reach it so an eligible second touch can be paired with its first touch.
    if (disposed || event.target === canvas || pointersDown.has(event.pointerId)) return;
    externalPointersDown.add(event.pointerId);
    trackPointer(event, 'outside', null);
    cancelActiveSequence();
    addFallbackListeners();
  }

  function onDocumentPointerEnd(event: PointerEvent): void {
    externalPointersDown.delete(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (disposed) return;
    const track = pointersDown.get(event.pointerId);
    if (!track) return;
    track.x = event.clientX;
    track.y = event.clientY;
    if (sequenceBlocked) return;
    if (pinch?.pointerIds.includes(event.pointerId)) {
      movePinch();
      return;
    }
    const current = gesture;
    if (current?.pointerId === event.pointerId) moveGesture(current, event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent): void {
    finishPointer(event, false);
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!pointersDown.has(event.pointerId)) return;
    cancelActiveSequence();
    pointersDown.delete(event.pointerId);
    if (pointersDown.size === 0) {
      sequenceBlocked = false;
      removeFallbackListeners();
    }
  }

  function onLostPointerCapture(event: PointerEvent): void {
    if (!pointersDown.has(event.pointerId)) return;
    // Losing capture cancels the gesture, but the contact may still be down.
    // Keep ownership until pointerup or pointercancel arrives.
    cancelActiveSequence();
  }

  function onWheel(event: WheelEvent): void {
    if (disposed || event.target !== canvas || pointersDown.size > 0 || externalPointersDown.size > 0
      || canvas.ownerDocument?.hidden) return;
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;

    let pixelsPerUnit: number;
    switch (event.deltaMode) {
      case 0:
        pixelsPerUnit = 1;
        break;
      case 1:
        pixelsPerUnit = 16;
        break;
      case 2:
        pixelsPerUnit = canvas.clientHeight;
        break;
      default:
        return;
    }
    if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return;

    const boundedDelta = Math.abs(event.deltaY) > 1000 / pixelsPerUnit
      ? Math.sign(event.deltaY) * 1000
      : event.deltaY * pixelsPerUnit;
    if (!Number.isFinite(boundedDelta) || boundedDelta === 0) return;

    event.preventDefault();
    onIntent({ type: 'ZoomCamera', scale: Math.exp(-0.001 * boundedDelta) });
  }

  const fallbackMoveListener: EventListener = (event) => onPointerMove(event as PointerEvent);
  const fallbackUpListener: EventListener = (event) => onPointerUp(event as PointerEvent);
  const fallbackCancelListener: EventListener = (event) => onPointerCancel(event as PointerEvent);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onLostPointerCapture);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.ownerDocument?.addEventListener?.('pointerdown', onDocumentPointerDown, true);
  canvas.ownerDocument?.addEventListener?.('pointerup', onDocumentPointerEnd, true);
  canvas.ownerDocument?.addEventListener?.('pointercancel', onDocumentPointerEnd, true);

  return {
    cancelGesture() {
      cancelActiveSequence(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
      canvas.removeEventListener('wheel', onWheel);
      canvas.ownerDocument?.removeEventListener?.('pointerdown', onDocumentPointerDown, true);
      canvas.ownerDocument?.removeEventListener?.('pointerup', onDocumentPointerEnd, true);
      canvas.ownerDocument?.removeEventListener?.('pointercancel', onDocumentPointerEnd, true);
      const pointerIds = [...pointersDown.keys()];
      gesture = null;
      pinch = null;
      sequenceBlocked = true;
      pointersDown.clear();
      externalPointersDown.clear();
      removeFallbackListeners();
      for (const pointerId of pointerIds) releaseCapture(pointerId);
    },
  };
}
