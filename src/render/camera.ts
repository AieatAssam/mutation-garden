import { OrthographicCamera, Vector3 } from 'three';

const MAX_PAN_DISTANCE = 2.5;

interface CameraPanState {
  basePosition: Vector3;
  baseTarget: Vector3;
  offset: Vector3;
  viewportWidth: number;
  viewportHeight: number;
}

const panStates = new WeakMap<OrthographicCamera, CameraPanState>();

function applyPose(camera: OrthographicCamera, state: CameraPanState): void {
  camera.position.copy(state.basePosition).add(state.offset);
  camera.lookAt(state.baseTarget.clone().add(state.offset));
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
    };
    panStates.set(camera, state);
  }
  return state;
}

export function createGardenCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
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
  const offsetLength = state.offset.length();
  if (offsetLength > MAX_PAN_DISTANCE) state.offset.multiplyScalar(MAX_PAN_DISTANCE / offsetLength);
  camera.left = -viewHeight * aspect * 0.5;
  camera.right = viewHeight * aspect * 0.5;
  camera.top = viewHeight * 0.5;
  camera.bottom = -viewHeight * 0.5;
  camera.updateProjectionMatrix();
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
  const worldUnitsPerCssPixelX = (camera.right - camera.left) / cssWidth;
  const worldUnitsPerCssPixelY = (camera.top - camera.bottom) / cssHeight;
  if (!Number.isFinite(worldUnitsPerCssPixelX) || worldUnitsPerCssPixelX <= 0 ||
    !Number.isFinite(worldUnitsPerCssPixelY) || worldUnitsPerCssPixelY <= 0) return;

  // Bound the intermediate translation before multiplying so every finite input stays finite.
  const maxCssDeltaX = (MAX_PAN_DISTANCE * 2) / worldUnitsPerCssPixelX;
  const maxCssDeltaY = (MAX_PAN_DISTANCE * 2) / worldUnitsPerCssPixelY;
  if (!Number.isFinite(maxCssDeltaX) || !Number.isFinite(maxCssDeltaY)) return;
  const boundedDeltaX = Math.max(-maxCssDeltaX, Math.min(maxCssDeltaX, deltaXCss));
  const boundedDeltaY = Math.max(-maxCssDeltaY, Math.min(maxCssDeltaY, deltaYCss));

  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const panX = -boundedDeltaX * worldUnitsPerCssPixelX;
  const panY = boundedDeltaY * worldUnitsPerCssPixelY;
  state.offset.addScaledVector(right, panX);
  state.offset.addScaledVector(up, panY);

  const offsetLength = state.offset.length();
  if (offsetLength > MAX_PAN_DISTANCE) state.offset.multiplyScalar(MAX_PAN_DISTANCE / offsetLength);
  applyPose(camera, state);
}
