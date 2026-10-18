import { createRenderer } from '../../../src/render/renderer';
import { createGardenCamera, resizeGardenCamera } from '../../../src/render/camera';
import type { PickResult } from '../../../src/render/picking';
import { Vector3 } from 'three';

interface GardenProbe {
  inspect(): {
    canvasRect: { left: number; top: number; width: number; height: number };
    plots: Array<{ plotId: string; x: number; y: number }>;
    ground: { x: number; y: number };
    sky: { x: number; y: number };
  };
  pick(x: number, y: number): PickResult;
  resize(): void;
  setInset(enabled: boolean): void;
  dispose(): void;
}

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Garden fixture canvas is missing');
const stage = canvas as HTMLCanvasElement;
const probeWindow = window as Window & { gardenProbe: GardenProbe };
const renderer = createRenderer(stage);
const referenceCamera = createGardenCamera();
const point = new Vector3();
let inset = false;
function resize() {
  const rect = stage.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
}
function onWindowResize() {
  if (inset) probeWindow.gardenProbe.setInset(true);
  else resize();
}
function project(x: number, y: number, z: number, rect: DOMRect): { x: number; y: number } {
  point.set(x, y, z).project(referenceCamera);
  return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
}
probeWindow.gardenProbe = {
  inspect() {
    const rect = stage.getBoundingClientRect();
    resizeGardenCamera(referenceCamera, rect.width, rect.height);
    referenceCamera.updateMatrixWorld(true);
    const plots = Array.from({ length: 6 }, (_, index) => {
      const row = Math.floor(index / 2);
      const column = index % 2;
      return { plotId: `plot-${index}`, ...project(column ? 1 : -1, 0.58, 2 - row * 2, rect) };
    });
    return {
      canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      plots,
      ground: project(0, 0.48, 0, rect),
      sky: project(0, 0.48, -4.5, rect),
    };
  },
  pick: (x, y) => renderer.pick(x, y),
  resize,
  setInset(enabled) {
    inset = enabled;
    if (inset) {
      stage.style.position = 'absolute';
      stage.style.left = '8px';
      stage.style.top = '8px';
      stage.style.width = `${Math.max(1, window.innerWidth - 16)}px`;
      stage.style.height = `${Math.max(1, window.innerHeight - 16)}px`;
    } else {
      stage.removeAttribute('style');
    }
    resize();
  },
  dispose() {
    window.removeEventListener('resize', onWindowResize);
    renderer.dispose();
  },
};
window.addEventListener('resize', onWindowResize);
resize();
document.body.dataset.render = 'complete';
