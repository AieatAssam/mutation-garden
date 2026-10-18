import { AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshToonMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createMaterialLibrary } from '../../../src/render/materials';
import { createBubbleBerry } from '../../../src/render/plants/bubble-berry';
import { createPlantReconciler } from '../../../src/render/plants/reconcile';
import { createGardenCamera, resizeGardenCamera } from '../../../src/render/camera';
import { createGarden } from '../../../src/render/garden';
import { palette } from '../../../src/render/palette';
import type { GardenSnapshot, PlantSnapshot } from '../../../src/sim';

document.documentElement.style.setProperty('--sky', palette.environment['sky-day'].mid);
document.documentElement.style.setProperty('--ink', palette.ink['press-ink']);
document.documentElement.style.setProperty('--paper', palette.ink['paper-white']);
document.documentElement.style.setProperty('--tomato', palette.ink['misprint-tomato']);

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const silhouetteCanvas = document.querySelector<HTMLCanvasElement>('#silhouette')!;
const status = document.querySelector<HTMLElement>('#status')!;
const stages: PlantSnapshot['stage'][] = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];
const progress = [0.02, 0.2, 0.48, 0.78, 1];
let renderer: WebGLRenderer;
const cleanup: Array<() => void> = [];

function renderSilhouette() {
  const silhouetteRenderer = new WebGLRenderer({ canvas: silhouetteCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  silhouetteRenderer.setSize(48, 48, false);
  const scene = new Scene();
  const camera = new OrthographicCamera(-0.9, 0.9, 0.9, -0.9, 0.1, 20);
  camera.position.set(0, 2.5, 5); camera.lookAt(0, 0.3, 0);
  const silhouetteMaterial = new MeshToonMaterial({ color: palette.ink['press-ink'], toneMapped: false });
  const rig = createBubbleBerry({
    toon: () => silhouetteMaterial,
    outline: () => { const mesh = new Mesh(); mesh.visible = false; return mesh; },
    blob: () => { const mesh = new Mesh(); mesh.visible = false; return mesh; },
    dispose() {},
  });
  rig.update({ speciesId: 'bubble-berry', plantedAt: 0, progress: 1, stage: 'Harvestable' }, 0, true);
  rig.root.traverse((object) => {
    if (object instanceof Mesh && (String(object.userData.part).endsWith('-outline')
      || object.userData.part === 'halo' || object.userData.part === 'blob')) object.visible = false;
  });
  rig.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(rig.root);
  const center = bounds.getCenter(new Vector3());
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  rig.root.position.sub(center);
  const frameSize = Math.max(width, height) * 1.3;
  camera.left = -frameSize / 2; camera.right = frameSize / 2;
  camera.top = frameSize / 2; camera.bottom = -frameSize / 2;
  camera.position.set(0, 0, frameSize * 3); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  scene.add(new AmbientLight(palette.lighting.day['fill-sky'], 1), rig.root); silhouetteRenderer.render(scene, camera);
  silhouetteCanvas.dataset.projectedHeight = String(height / frameSize * 48);
  cleanup.push(() => { rig.dispose(); silhouetteMaterial.dispose(); silhouetteRenderer.dispose(); });
}

function renderLineup() {
  const materialLibrary = createMaterialLibrary();
  renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setClearColor(new Color(palette.environment['sky-day'].mid));
  const scene = new Scene(); scene.background = new Color(palette.environment['sky-day'].mid);
  const light = new DirectionalLight(palette.lighting.day.key, 2.1); light.position.set(-3, 5, 5); scene.add(new AmbientLight(palette.lighting.day['fill-sky'], 1.1), light);
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 50);
  camera.position.set(0, 3, 12); camera.lookAt(0, 0, 0);
  const portrait = innerHeight > innerWidth;
  const rigs = stages.map((stage, index) => {
    const holder = new Group();
    holder.scale.setScalar(1.55); scene.add(holder);
    const rig = createBubbleBerry(materialLibrary, index * 410);
    rig.update({ speciesId: 'bubble-berry', plantedAt: 0, stage, progress: progress[index]! }, 0, true);
    rig.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(rig.root);
    const centerY = portrait
      ? 4.4 - (112 + index * 155) / innerHeight * 8.8
      : -3.05 - bounds.min.y * 1.55;
    holder.position.set(portrait ? 0 : (index - 2) * 1.92, centerY - bounds.getCenter(new Vector3()).y * 1.55, 0);
    holder.add(rig.root); return rig;
  });
  status.dataset.stageHeights = JSON.stringify(rigs.map((rig) => {
    rig.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(rig.root);
    return bounds.max.y - bounds.min.y;
  }));
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    const aspect = innerWidth / innerHeight;
    camera.left = -4 * aspect; camera.right = 4 * aspect; camera.top = 4; camera.bottom = -4;
    if (innerHeight > innerWidth) { camera.left = -2.4; camera.right = 2.4; camera.top = 4.4; camera.bottom = -4.4; }
    camera.updateProjectionMatrix(); renderer.render(scene, camera);
  };
  resize(); window.addEventListener('resize', resize);
  cleanup.push(() => { window.removeEventListener('resize', resize); rigs.forEach((rig) => rig.dispose()); renderer.dispose(); materialLibrary.dispose(); });
}

function renderSixRipeGarden() {
  document.body.dataset.mode = 'six-ripe';
  renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setClearColor(new Color(palette.environment['sky-day'].horizon));
  const materials = createMaterialLibrary();
  const garden = createGarden(materials); const scene = new Scene(); scene.add(garden);
  const day = palette.lighting.day;
  scene.add(new AmbientLight(day['fill-sky'], 0.25), new HemisphereLight(day['fill-sky'], day['fill-ground'], 0.8));
  const keyLight = new DirectionalLight(day.key, 2.2); keyLight.position.set(-4, 7, 5); scene.add(keyLight);
  const camera = createGardenCamera();
  const plants = createPlantReconciler(garden.plots, materials);
  const planted: PlantSnapshot = { speciesId: 'bubble-berry', plantedAt: 0, stage: 'Harvestable', progress: 1 };
  const snapshot: GardenSnapshot = { nowMs: 15_000, coins: 100, plots: garden.plots.map((plot) => ({ id: plot.plotId, plant: planted })) };
  renderer.setSize(innerWidth, innerHeight, false); resizeGardenCamera(camera, innerWidth, innerHeight);
  renderer.render(scene, camera);
  plants.update(snapshot, snapshot, 1, true);
  renderer.render(scene, camera);
  status.dataset.drawCalls = String(renderer.info.render.calls);
  status.dataset.plants = String(garden.plots.length);
  status.dataset.ripe = String(garden.plots.filter((plot) => plot.children.length === 1).length);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); resizeGardenCamera(camera, innerWidth, innerHeight); renderer.render(scene, camera); };
  window.addEventListener('resize', resize);
  cleanup.push(() => { window.removeEventListener('resize', resize); plants.dispose(); garden.dispose(); materials.dispose(); renderer.dispose(); });
}

if (new URLSearchParams(location.search).has('six-ripe')) renderSixRipeGarden();
else { renderLineup(); renderSilhouette(); }
requestAnimationFrame(() => {
  status.dataset.render = 'complete'; status.dataset.frame = 'ready'; status.textContent = 'Ready';
});
window.addEventListener('pagehide', () => { cleanup.forEach((dispose) => dispose()); });
