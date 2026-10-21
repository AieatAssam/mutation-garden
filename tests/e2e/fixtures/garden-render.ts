import { createRenderer } from '../../../src/render/renderer';
import { createGardenCamera, panGardenCamera, resizeGardenCamera } from '../../../src/render/camera';
import { createGarden } from '../../../src/render/garden';
import { createMaterialLibrary } from '../../../src/render/materials';
import type { PickResult } from '../../../src/render/picking';
import { createInitialState, getSnapshot, step } from '../../../src/sim';
import { Vector3 } from 'three';
import { renderOptions } from './render-options';

interface GardenProbe {
  inspect(): {
    canvasRect: { left: number; top: number; width: number; height: number };
    plots: Array<{ plotId: string; x: number; y: number }>;
    ground: { x: number; y: number };
    sky: { x: number; y: number };
  };
  pick(x: number, y: number): PickResult;
  pan(deltaX: number, deltaY: number): void;
  resize(): void;
  setInset(enabled: boolean): void;
  dispose(): void;
}

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Garden fixture canvas is missing');
const stage = canvas as HTMLCanvasElement;
const probeWindow = window as unknown as Window & { gardenProbe: GardenProbe };
const renderer = createRenderer(stage, renderOptions);
const probeMaterials = createMaterialLibrary();
const probeGarden = createGarden(probeMaterials);
probeGarden.updateMatrixWorld(true);
const referenceCamera = createGardenCamera();
const point = new Vector3();
let inset = false;
let disposed = false;
function resize() {
  const rect = stage.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
}
function onWindowResize() {
  if (inset) probeWindow.gardenProbe.setInset(true);
  else resize();
}
const seedState = createInitialState(1, 0);
const plantedState = step(seedState, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
const growingState = step(plantedState, [], 7_999).state;
const harvestableState = step(growingState, [], 8_000).state;
renderer.render(getSnapshot(growingState), getSnapshot(harvestableState), 1, false);
function project(worldPoint: Vector3, rect: DOMRect): { x: number; y: number } {
  point.copy(worldPoint).project(referenceCamera);
  return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
}
probeWindow.gardenProbe = {
  inspect() {
    const rect = stage.getBoundingClientRect();
    resizeGardenCamera(referenceCamera, rect.width, rect.height);
    referenceCamera.updateMatrixWorld(true);
    const plots = probeGarden.plots.map((anchor) => ({
      plotId: anchor.plotId,
      ...project(anchor.getWorldPosition(new Vector3()), rect),
    }));
    return {
      canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      plots,
      ground: project(probeGarden.localToWorld(new Vector3(0, 0.48, 0)), rect),
      sky: project(probeGarden.localToWorld(new Vector3(0, 0.48, -6)), rect),
    };
  },
  pick: (x, y) => renderer.pick(x, y),
  pan(deltaX, deltaY) {
    renderer.pan(deltaX, deltaY);
    const rect = stage.getBoundingClientRect();
    panGardenCamera(referenceCamera, deltaX, deltaY, rect.width, rect.height);
  },
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
    if (disposed) return;
    disposed = true;
    window.removeEventListener('resize', onWindowResize);
    renderer.dispose();
    probeGarden.dispose();
    probeMaterials.dispose();
  },
};
window.addEventListener('resize', onWindowResize);
resize();
document.body.dataset.render = 'complete';
