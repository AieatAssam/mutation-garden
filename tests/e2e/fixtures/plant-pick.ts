import { Vector3 } from 'three';
import { createPointerInput } from '../../../src/input/pointer';
import { createRenderer } from '../../../src/render/renderer';
import { createGardenCamera, resizeGardenCamera } from '../../../src/render/camera';
import { createGarden } from '../../../src/render/garden';
import { createMaterialLibrary } from '../../../src/render/materials';
import { createPlantReconciler } from '../../../src/render/plants/reconcile';
import { createInitialState, getSnapshot, step } from '../../../src/sim';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Plant picker fixture canvas is missing');
const stage = canvas;
const renderer = createRenderer(stage);
const seedState = createInitialState(1, 0);
const plantedState = step(seedState, [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 0).state;
const ripeState = step(plantedState, [], 8_000).state;
const snapshot = getSnapshot(ripeState);
renderer.render(snapshot, snapshot, 1, true);
const initialRect = stage.getBoundingClientRect();
renderer.resize(initialRect.width, initialRect.height);

const materials = createMaterialLibrary();
const garden = createGarden(materials);
const reconciler = createPlantReconciler(garden.plots, materials);
reconciler.update(snapshot, snapshot, 1, true);
garden.updateMatrixWorld(true);
const fruit = garden.plots[0]!.children[0]!.getObjectByName('fruit');
if (!fruit) throw new Error('Plant picker fixture Sunny fruit is missing');
const camera = createGardenCamera();
const rect = initialRect;
resizeGardenCamera(camera, rect.width, rect.height);
camera.updateMatrixWorld(true);
const fruitPoint = fruit.getWorldPosition(new Vector3()).project(camera);
const screenX = rect.left + (fruitPoint.x + 1) * rect.width / 2;
const screenY = rect.top + (1 - fruitPoint.y) * rect.height / 2;
const plotPoint = garden.plots[0]!.getWorldPosition(new Vector3()).project(camera);
const plotX = rect.left + (plotPoint.x + 1) * rect.width / 2;
const plotY = rect.top + (1 - plotPoint.y) * rect.height / 2;
document.body.dataset.fruitX = String(screenX);
document.body.dataset.fruitY = String(screenY);
document.body.dataset.plotX = String(plotX);
document.body.dataset.plotY = String(plotY);
document.body.dataset.fruitPick = JSON.stringify(renderer.pick(screenX, screenY));

const input = createPointerInput(stage, renderer.pick, (intent) => {
  if (intent.type === 'ActivatePlot') document.body.dataset.activatedPlot = intent.plotId;
});
function resize(): void {
  const bounds = stage.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height);
}
window.addEventListener('resize', resize);
resize();
document.body.dataset.render = 'complete';
window.addEventListener('beforeunload', () => {
  input.dispose();
  renderer.dispose();
  reconciler.dispose();
  garden.dispose();
  materials.dispose();
});
