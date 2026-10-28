import { OrthographicCamera, Vector3 } from 'three';

const MAX_PAN_DISTANCE = 2.5;
/** Highest ready stamp above a plot (tallest big plant plus the stamp lift). */
const STAMP_TOP_Y = 3.3;
/**
 * Height of the top HUD that ready stamps stay below. Portrait: coin row, wrapped controls, status
 * row and objective. Landscape: the objective sits in the top row (src/ui/garden-ui.css).
 */
const topHudPx = (state: CameraPanState) => (state.viewportWidth < state.viewportHeight ? 150 : 70);
const MIN_CAMERA_ZOOM = 1;
const MAX_CAMERA_ZOOM = 1.35;
const PLOT_TARGET_HALF_SIZE = 24;
const PLOT_TARGET_MARGIN = 8;
const PORTRAIT_FRAMING_OFFSET = 0;
const PLOT_TARGET_CENTERS = [
  [-1.05, 0.65, 2], [1.05, 0.65, 2],
  [-1.05, 0.65, 0], [1.05, 0.65, 0],
  [-1.05, 0.65, -2], [1.05, 0.65, -2],
] as const;
const EXPANDED_TARGET_CENTERS = [...PLOT_TARGET_CENTERS, [-5.25, 0.65, 0], [-7.35, 0.65, 0]] as const;
const targets = (camera: OrthographicCamera) => panStates.get(camera)?.expanded ? EXPANDED_TARGET_CENTERS : PLOT_TARGET_CENTERS;

interface CameraPanState {
  basePosition: Vector3;
  baseTarget: Vector3;
  offset: Vector3;
  viewportWidth: number;
  viewportHeight: number;
  lastSaturatedInput: { deltaXCss: number; deltaYCss: number } | undefined;
  expanded: boolean;
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
  for (const center of targets(camera)) {
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

  // Solve the limit at zoom 1 from the resting pose: screen reach grows linearly with zoom about the
  // view centre, so repeated pinches always meet the same limit. Pan is clamped separately
  // (keepPlotTargetsInView), so a panned view still keeps every plot on screen.
  const offset = state.offset.clone();
  const zoom = camera.zoom;
  state.offset.set(0, 0, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  applyPose(camera, state);
  camera.updateMatrixWorld(true);
  const margin = PLOT_TARGET_HALF_SIZE + PLOT_TARGET_MARGIN;
  const availableX = state.viewportWidth / 2 - margin;
  const availableY = state.viewportHeight / 2 - margin;
  let limit = MAX_CAMERA_ZOOM;
  for (const center of targets(camera)) {
    const projected = new Vector3(...center).project(camera);
    const reachX = Math.abs(projected.x) * state.viewportWidth / 2;
    const reachY = Math.abs(projected.y) * state.viewportHeight / 2;
    if (reachX > 0) limit = Math.min(limit, availableX / reachX);
    if (reachY > 0) limit = Math.min(limit, availableY / reachY);
    // Keep ripe plants' ready stamps on screen and below the top HUD row, not just the plots.
    const stamp = new Vector3(center[0], STAMP_TOP_Y, center[2]).project(camera);
    const stampReach = Math.abs(stamp.y) * state.viewportHeight / 2;
    if (stampReach > 0) {
      limit = Math.min(limit, stamp.y > 0 ? (state.viewportHeight / 2 - topHudPx(state)) / stampReach : availableY / stampReach);
    }
  }
  state.offset.copy(offset);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  applyPose(camera, state);
  if (availableX <= 0 || availableY <= 0 || !Number.isFinite(limit)) return MIN_CAMERA_ZOOM;
  return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, limit));
}

function reconcileZoom(camera: OrthographicCamera, state: CameraPanState): void {
  camera.zoom = Math.min(camera.zoom, maximumCameraZoom(camera, state));
  camera.updateProjectionMatrix();
}

function keepPlotTargetsInView(camera: OrthographicCamera, state: CameraPanState): void {
  if (state.viewportWidth <= 0) return;
  applyPose(camera, state);
  const [minDelta, maxDelta] = horizontalPanDeltaBounds(camera, state.viewportWidth);
  const correction = minDelta <= maxDelta ? Math.max(minDelta, Math.min(maxDelta, 0)) : 0;
  if (correction !== 0) {
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const worldUnitsPerCssPixel = (camera.right - camera.left) / (state.viewportWidth * camera.zoom);
    state.offset.addScaledVector(right, -correction * worldUnitsPerCssPixel);
    applyPose(camera, state);
  }
  keepPlotTargetsInViewVertically(camera, state);
}

/** Pan and zoom can carry the front or back row off screen vertically; slide the view back. */
function keepPlotTargetsInViewVertically(camera: OrthographicCamera, state: CameraPanState): void {
  if (state.viewportHeight <= 0) return;
  camera.updateMatrixWorld(true);
  const margin = PLOT_TARGET_HALF_SIZE + PLOT_TARGET_MARGIN;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const center of targets(camera)) {
    const y = (1 - new Vector3(...center).project(camera).y) * state.viewportHeight / 2;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  // Screen pixels to move the garden down (positive) or up so every plot target fits.
  const lowest = margin - top;
  const highest = state.viewportHeight - margin - bottom;
  if (lowest > highest) return;
  const shift = Math.max(lowest, Math.min(highest, 0));
  if (shift === 0) return;
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  state.offset.addScaledVector(up, shift * (camera.top - camera.bottom) / (state.viewportHeight * camera.zoom));
  applyPose(camera, state);
}

/** World-space shift that brings every ready stamp below the top HUD row, or null when none is needed. */
function stampHudShift(camera: OrthographicCamera, state: CameraPanState): Vector3 | null {
  if (state.viewportHeight <= 0) return null;
  applyPose(camera, state);
  camera.updateMatrixWorld(true);
  let topY = Number.POSITIVE_INFINITY;
  for (const center of targets(camera)) {
    const projected = new Vector3(center[0], STAMP_TOP_Y, center[2]).project(camera);
    topY = Math.min(topY, (1 - projected.y) * state.viewportHeight / 2);
  }
  const shortfall = topHudPx(state) - topY;
  if (!(shortfall > 0)) return null;
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  return up.multiplyScalar(shortfall * (camera.top - camera.bottom) / (state.viewportHeight * camera.zoom));
}

/** After a pan or zoom, nudge the view so no ready stamp sits under the top HUD row. */
function keepStampsBelowHud(camera: OrthographicCamera, state: CameraPanState): void {
  const shift = stampHudShift(camera, state);
  if (shift) state.offset.add(shift);
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
    lastSaturatedInput: undefined, expanded: false,
    };
    panStates.set(camera, state);
  }
  return state;
}

/** Brief 2 cm camera bump for a large harvest combo. */
export function nudgeGardenCamera(camera: OrthographicCamera, distance = 0.02): void {
  const state = panStates.get(camera);
  if (!state) return;
  state.offset.x += distance;
  applyPose(camera, state);
  setTimeout(() => {
    state.offset.x -= distance;
    applyPose(camera, state);
  }, 100);
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
  const state = getPanState(camera);
  // Portrait fits the beds plus a margin to the phone width and lets the island run off the sides.
  const viewHeight = portrait ? Math.min(state.expanded ? 32.4 : 16.4, (state.expanded ? 14.4 : 6.2) / aspect) : Math.min(9.4, safeHeight / 56);

  state.basePosition.set(3.6, 8.5, 11);
  state.baseTarget.set(state.expanded ? -3 : 0.35, portrait ? 0.2 : 1.2, 0.3);
  state.viewportWidth = safeWidth;
  state.viewportHeight = safeHeight;
  state.lastSaturatedInput = undefined;
  const offsetLength = state.offset.length();
  if (offsetLength > MAX_PAN_DISTANCE) state.offset.multiplyScalar(MAX_PAN_DISTANCE / offsetLength);
  camera.left = -viewHeight * aspect * 0.5;
  camera.right = viewHeight * aspect * 0.5;
  const verticalCenter = portrait ? PORTRAIT_FRAMING_OFFSET : 0;
  camera.top = viewHeight * 0.5 + verticalCenter;
  camera.bottom = -viewHeight * 0.5 + verticalCenter;
  camera.updateProjectionMatrix();
  // The resting pose depends only on the viewport: at zoom 1 with no pan, back-row stamps clear the HUD row.
  const zoom = camera.zoom;
  const offset = state.offset.clone();
  camera.zoom = MIN_CAMERA_ZOOM;
  camera.updateProjectionMatrix();
  state.offset.set(0, 0, 0);
  const baseShift = stampHudShift(camera, state);
  if (baseShift) {
    state.basePosition.add(baseShift);
    state.baseTarget.add(baseShift);
  }
  state.offset.copy(offset);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  applyPose(camera, state);
  reconcileZoom(camera, state);
  keepPlotTargetsInView(camera, state);
  keepStampsBelowHud(camera, state);
  applyPose(camera, state);
}

export function setGardenCameraExpanded(camera: OrthographicCamera, expanded: boolean): void {
  const state = panStates.get(camera);
  if (!state || state.expanded === expanded) return;
  state.expanded = expanded;
  resizeGardenCamera(camera, state.viewportWidth, state.viewportHeight);
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
  keepStampsBelowHud(camera, state);
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
  keepPlotTargetsInViewVertically(camera, state);
  keepStampsBelowHud(camera, state);
  applyPose(camera, state);
}
