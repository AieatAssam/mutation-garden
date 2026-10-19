import { OrthographicCamera, Vector3 } from 'three';

const MAX_PAN_DISTANCE = 2.5;
const MIN_CAMERA_ZOOM = 1;
const MAX_CAMERA_ZOOM = 1.35;
const PLOT_TARGET_HALF_SIZE = 24;
const PLOT_TARGET_MARGIN = 8;
const PLOT_TARGET_CENTERS = [
  [-1.05, 0.65, 2], [1.05, 0.65, 2],
  [-1.05, 0.65, 0], [1.05, 0.65, 0],
  [-1.05, 0.65, -2], [1.05, 0.65, -2],
] as const;

interface CameraPanState {
  basePosition: Vector3;
  baseTarget: Vector3;
  offset: Vector3;
  viewportWidth: number;
  viewportHeight: number;
  lastSaturatedInput: { deltaXCss: number; deltaYCss: number } | undefined;
}

const panStates = new WeakMap<OrthographicCamera, CameraPanState>();

function applyPose(camera: OrthographicCamera, state: CameraPanState): void {
  camera.position.copy(state.basePosition).add(state.offset);
  camera.lookAt(state.baseTarget.clone().add(state.offset));
}

function horizontalPanDeltaBounds(camera: OrthographicCamera, width: number): readonly [number, number] {
  camera.updateMatrixWorld(true);
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;
  for (const center of PLOT_TARGET_CENTERS) {
    const screenX = (new Vector3(...center).project(camera).x + 1) * width / 2;
    minDelta = Math.max(minDelta, PLOT_TARGET_HALF_SIZE + PLOT_TARGET_MARGIN - screenX);
    maxDelta = Math.min(maxDelta, width - PLOT_TARGET_HALF_SIZE - PLOT_TARGET_MARGIN - screenX);
  }
  return [minDelta, maxDelta];
}

function maximumCameraZoom(camera: OrthographicCamera, state: CameraPanState): number {
  if (state.viewportWidth <= 0 || !Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    return MAX_CAMERA_ZOOM;
  }

  camera.updateMatrixWorld(true);
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const center of PLOT_TARGET_CENTERS) {
    const screenX = (new Vector3(...center).project(camera).x + 1) * state.viewportWidth / 2;
    left = Math.min(left, screenX);
    right = Math.max(right, screenX);
  }

  const currentSpan = right - left;
  const availableWidth = state.viewportWidth - 2 * (PLOT_TARGET_HALF_SIZE + PLOT_TARGET_MARGIN);
  if (!Number.isFinite(currentSpan) || currentSpan <= 0 || availableWidth <= 0) return MIN_CAMERA_ZOOM;
  const fitZoom = camera.zoom * availableWidth / currentSpan;
  return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, fitZoom));
}

function reconcileZoom(camera: OrthographicCamera, state: CameraPanState): void {
  camera.zoom = Math.min(camera.zoom, maximumCameraZoom(camera, state));
  camera.updateProjectionMatrix();
}

function keepPlotTargetsInView(camera: OrthographicCamera, state: CameraPanState): void {
  if (state.viewportWidth <= 0) return;
  applyPose(camera, state);
  const [minDelta, maxDelta] = horizontalPanDeltaBounds(camera, state.viewportWidth);
  if (minDelta > maxDelta) return;
  const correction = Math.max(minDelta, Math.min(maxDelta, 0));
  if (correction === 0) return;
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const worldUnitsPerCssPixel = (camera.right - camera.left) / (state.viewportWidth * camera.zoom);
  state.offset.addScaledVector(right, -correction * worldUnitsPerCssPixel);
}

function getPanState(camera: OrthographicCamera): CameraPanState {
  let state = panStates.get(camera);
  if (!state) {
    state = {
      basePosition: camera.position.clone(),
      baseTarget: new Vector3(0, 0, 0),
      offset: new Vector3(),
      viewportWidth: 0,
      viewportHeight: 0,
      lastSaturatedInput: undefined,
    };
    panStates.set(camera, state);
  }
  return state;
}

export function createGardenCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
  camera.zoom = MIN_CAMERA_ZOOM;
  camera.updateProjectionMatrix();
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function resizeGardenCamera(camera: OrthographicCamera, width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const safeWidth = width;
  const safeHeight = height;
  const aspect = safeWidth / safeHeight;
  const portrait = aspect < 1;
  const viewHeight = portrait
    ? Math.min(18.2, safeHeight / 48)
    : Math.min(9, safeHeight / 50);

  const state = getPanState(camera);
  if (portrait) {
    state.basePosition.set(10.5, 12.5, 17);
    state.baseTarget.set(0, 1.3, 0);
  } else {
    state.basePosition.set(10.5, 6.8, 14);
    state.baseTarget.set(-2.6, -1.3, 0);
  }
  state.viewportWidth = safeWidth;
  state.viewportHeight = safeHeight;
  state.lastSaturatedInput = undefined;
  const offsetLength = state.offset.length();
  if (offsetLength > MAX_PAN_DISTANCE) state.offset.multiplyScalar(MAX_PAN_DISTANCE / offsetLength);
  camera.left = -viewHeight * aspect * 0.5;
  camera.right = viewHeight * aspect * 0.5;
  camera.top = viewHeight * 0.5;
  camera.bottom = -viewHeight * 0.5;
  camera.updateProjectionMatrix();
  applyPose(camera, state);
  reconcileZoom(camera, state);
  keepPlotTargetsInView(camera, state);
  applyPose(camera, state);
}

/** Apply a finite, positive zoom increment while keeping every plot target in view. */
export function zoomGardenCamera(camera: OrthographicCamera, scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(camera.zoom) || camera.zoom <= 0) return;
  const state = panStates.get(camera);
  if (!state) return;

  const maximumZoom = maximumCameraZoom(camera, state);
  const nextZoom = scale >= maximumZoom / camera.zoom
    ? maximumZoom
    : Math.max(MIN_CAMERA_ZOOM, camera.zoom * scale);
  if (nextZoom === camera.zoom) return;

  camera.zoom = nextZoom;
  camera.updateProjectionMatrix();
  state.lastSaturatedInput = undefined;
  keepPlotTargetsInView(camera, state);
  applyPose(camera, state);
}

/** Move the responsive camera pose opposite the finger so the garden follows the drag. */
export function panGardenCamera(
  camera: OrthographicCamera,
  deltaXCss: number,
  deltaYCss: number,
  viewportWidth?: number,
  viewportHeight?: number,
): void {
  if (!Number.isFinite(deltaXCss) || !Number.isFinite(deltaYCss)) return;
  const state = panStates.get(camera);
  if (!state || state.viewportHeight <= 0) return;
  if (viewportWidth !== undefined || viewportHeight !== undefined) {
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) ||
      viewportWidth! <= 0 || viewportHeight! <= 0) return;
  }

  const cssWidth = viewportWidth ?? state.viewportWidth;
  const cssHeight = viewportHeight ?? state.viewportHeight;
  const worldUnitsPerCssPixelX = (camera.right - camera.left) / (cssWidth * camera.zoom);
  const worldUnitsPerCssPixelY = (camera.top - camera.bottom) / (cssHeight * camera.zoom);
  if (!Number.isFinite(worldUnitsPerCssPixelX) || worldUnitsPerCssPixelX <= 0 ||
    !Number.isFinite(worldUnitsPerCssPixelY) || worldUnitsPerCssPixelY <= 0) return;

  // Bound the intermediate translation before multiplying so every finite input stays finite.
  const maxCssDeltaX = (MAX_PAN_DISTANCE * 2) / worldUnitsPerCssPixelX;
  const maxCssDeltaY = (MAX_PAN_DISTANCE * 2) / worldUnitsPerCssPixelY;
  if (!Number.isFinite(maxCssDeltaX) || !Number.isFinite(maxCssDeltaY)) return;
  const boundedDeltaX = Math.max(-maxCssDeltaX, Math.min(maxCssDeltaX, deltaXCss));
  const boundedDeltaY = Math.max(-maxCssDeltaY, Math.min(maxCssDeltaY, deltaYCss));
  const inputWasBounded = boundedDeltaX !== deltaXCss || boundedDeltaY !== deltaYCss;
  // Keep an oversized command idempotent after saturation without suppressing later tangent drags.
  if (inputWasBounded && state.offset.length() >= MAX_PAN_DISTANCE - 1e-9 &&
    state.lastSaturatedInput?.deltaXCss === deltaXCss &&
    state.lastSaturatedInput.deltaYCss === deltaYCss) return;
  state.lastSaturatedInput = undefined;

  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const panY = boundedDeltaY * worldUnitsPerCssPixelY;
  const [minHorizontalDelta, maxHorizontalDelta] = horizontalPanDeltaBounds(camera, cssWidth);
  const boundedHorizontalDelta = minHorizontalDelta <= maxHorizontalDelta
    ? Math.max(minHorizontalDelta, Math.min(maxHorizontalDelta, boundedDeltaX))
    : 0;
  const requestedOffset = new Vector3()
    .addScaledVector(right, -boundedHorizontalDelta * worldUnitsPerCssPixelX)
    .addScaledVector(up, panY);
  state.offset.add(requestedOffset);

  const offsetLength = state.offset.length();
  if (offsetLength > MAX_PAN_DISTANCE) state.offset.multiplyScalar(MAX_PAN_DISTANCE / offsetLength);
  if (inputWasBounded && state.offset.length() >= MAX_PAN_DISTANCE - 1e-9) {
    state.lastSaturatedInput = { deltaXCss, deltaYCss };
  }
  applyPose(camera, state);
}
