import type { PlotId } from '../sim';
import type { InputIntent } from './types';

export type PickResult =
  | { readonly kind: 'plot'; readonly plotId: PlotId }
  | { readonly kind: 'ground' }
  | null;

export const POINTER_TAP_MOVE_THRESHOLD_CSS_PX = 10;

type Gesture = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startKind: 'plot' | 'ground' | 'miss';
  readonly plotId: PlotId | null;
  panning: boolean;
  panOffsetX: number;
  panOffsetY: number;
  cancelled: boolean;
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
  const pointersDown = new Set<number>();
  let fallbackTarget: EventTarget | null = null;
  let disposed = false;

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

  function cancelGesture(): void {
    const current = gesture;
    gesture = null;
    if (pointersDown.size > 0 && !fallbackTarget) addFallbackListeners();
    if (pointersDown.size === 0) removeFallbackListeners();
    if (current) releaseCapture(current.pointerId);
  }

  function moveGesture(current: Gesture, clientX: number, clientY: number): void {
    const distanceX = clientX - current.startX;
    const distanceY = clientY - current.startY;
    const distance = Math.hypot(distanceX, distanceY);

    if (!current.cancelled && !current.panning && distance > POINTER_TAP_MOVE_THRESHOLD_CSS_PX) {
      current.cancelled = true;
      if (current.startKind === 'ground') {
        current.panning = true;
      }
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

  function onPointerDown(event: PointerEvent): void {
    if (disposed || event.target !== canvas) return;
    if (pointersDown.has(event.pointerId)) return;
    if (pointersDown.size > 0) {
      pointersDown.add(event.pointerId);
      cancelGesture();
      return;
    }
    if (gesture) {
      if (gesture.pointerId !== event.pointerId) cancelGesture();
      return;
    }
    if (!event.isPrimary || event.button !== 0) return;

    pointersDown.add(event.pointerId);
    const result = pick(event.clientX, event.clientY);
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startKind: result?.kind ?? 'miss',
      plotId: result?.kind === 'plot' ? result.plotId : null,
      panning: false,
      panOffsetX: 0,
      panOffsetY: 0,
      cancelled: false,
    };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // A tap can still be recognized when capture is unavailable.
      addFallbackListeners();
    }
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (disposed || pointersDown.size === 0 || pointersDown.has(event.pointerId)) return;
    pointersDown.add(event.pointerId);
    cancelGesture();
  }

  function onPointerMove(event: PointerEvent): void {
    const current = gesture;
    if (disposed || !current || current.pointerId !== event.pointerId) return;
    moveGesture(current, event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent): void {
    pointersDown.delete(event.pointerId);
    if (pointersDown.size === 0) removeFallbackListeners();
    const current = gesture;
    if (disposed || !current || current.pointerId !== event.pointerId) return;
    moveGesture(current, event.clientX, event.clientY);
    const intent = !current.cancelled && current.plotId !== null && event.target === canvas
      ? { type: 'ActivatePlot' as const, plotId: current.plotId }
      : null;
    gesture = null;
    releaseCapture(current.pointerId);
    if (intent) onIntent(intent);
  }

  function onPointerCancel(event: PointerEvent): void {
    pointersDown.delete(event.pointerId);
    if (gesture?.pointerId === event.pointerId) cancelGesture();
    if (pointersDown.size === 0) removeFallbackListeners();
  }

  function onLostPointerCapture(event: PointerEvent): void {
    pointersDown.delete(event.pointerId);
    if (gesture?.pointerId === event.pointerId) gesture = null;
    if (pointersDown.size === 0) removeFallbackListeners();
  }

  const fallbackMoveListener: EventListener = (event) => onPointerMove(event as PointerEvent);
  const fallbackUpListener: EventListener = (event) => onPointerUp(event as PointerEvent);
  const fallbackCancelListener: EventListener = (event) => onPointerCancel(event as PointerEvent);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onLostPointerCapture);
  canvas.ownerDocument?.addEventListener?.('pointerdown', onDocumentPointerDown, true);

  return {
    cancelGesture,
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
      canvas.ownerDocument?.removeEventListener?.('pointerdown', onDocumentPointerDown, true);
      const current = gesture;
      gesture = null;
      pointersDown.clear();
      removeFallbackListeners();
      if (current) releaseCapture(current.pointerId);
    },
  };
}
