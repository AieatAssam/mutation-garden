import { OrthographicCamera } from 'three';

export function createGardenCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
  camera.position.set(0, 6, 14);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function resizeGardenCamera(camera: OrthographicCamera, width: number, height: number): void {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const portrait = aspect < 1;
  const viewHeight = portrait
    ? Math.min(18.2, safeHeight / 48)
    : Math.min(9, safeHeight / 50);

  if (portrait) {
    camera.position.set(10.5, 12.5, 17);
    camera.lookAt(0, 1.3, 0);
  } else {
    camera.position.set(10.5, 6.8, 14);
    camera.lookAt(-2.6, -1.3, 0);
  }
  camera.left = -viewHeight * aspect * 0.5;
  camera.right = viewHeight * aspect * 0.5;
  camera.top = viewHeight * 0.5;
  camera.bottom = -viewHeight * 0.5;
  camera.updateProjectionMatrix();
}
