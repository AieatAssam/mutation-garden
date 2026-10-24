import { AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshToonMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createMaterialLibrary } from '../../../src/render/materials';
import { createBubbleBerry } from '../../../src/render/plants/bubble-berry';
import { createTwistroot } from '../../../src/render/plants/twistroot';
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
const hasWebGlError = (target: HTMLCanvasElement) => {
  const gl = target.getContext('webgl2');
  return Boolean(gl && gl.getError() !== gl.NO_ERROR);
};
const params = new URLSearchParams(location.search);
const mixedSixRipe = params.has('six-ripe') && params.has('mixed');
const speciesId: PlantSnapshot['speciesId'] = params.get('species') === 'twistroot' ? 'twistroot' : 'bubble-berry';
document.title = speciesId === 'twistroot' ? 'Twistroot render fixture' : 'Bubble Berry render fixture';
silhouetteCanvas.setAttribute('aria-label', `${speciesId === 'twistroot' ? 'Twistroot' : 'Bubble Berry'} silhouette`);
const stages: PlantSnapshot['stage'][] = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];
const progress = speciesId === 'twistroot' ? [0.02, 0.12, 0.4, 0.88, 1] : [0.02, 0.2, 0.48, 0.78, 1];
const makeRig = speciesId === 'twistroot' ? createTwistroot : createBubbleBerry;
let renderer: WebGLRenderer;
const cleanup: Array<() => void> = [];

function renderSilhouette() {
  const silhouetteRenderer = new WebGLRenderer({ canvas: silhouetteCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  silhouetteRenderer.setSize(48, 48, false);
  const scene = new Scene();
  const camera = new OrthographicCamera(-0.9, 0.9, 0.9, -0.9, 0.1, 20);
  camera.position.set(0, 2.5, 5); camera.lookAt(0, 0.3, 0);
  const silhouetteMaterial = new MeshToonMaterial({ color: palette.ink['press-ink'], toneMapped: false });
  const materialLibrary = {
    toon: () => silhouetteMaterial,
    outline: () => { const mesh = new Mesh(); mesh.visible = false; return mesh; },
    blob: () => { const mesh = new Mesh(); mesh.visible = false; return mesh; },
    dispose() {},
  };
  const rig = makeRig(materialLibrary);
  rig.update({ speciesId, plantedAt: 0, progress: 1, stage: 'Harvestable' }, 0, true);
  rig.root.traverse((object) => {
    if (object instanceof Mesh && (String(object.userData.part).endsWith('-outline')
      || ['halo', 'blob', 'growth-ring'].includes(String(object.userData.part)))) object.visible = false;
  });
  rig.root.updateMatrixWorld(true);
  if (speciesId === 'twistroot') {
    const matureRig = makeRig(materialLibrary);
    matureRig.update({ speciesId, plantedAt: 0, progress: progress[3]!, stage: 'Mature' }, 0, true);
    const bodyBounds = (target: typeof rig) => {
      target.root.updateMatrixWorld(true);
      const bounds = new Box3();
      target.root.traverse((object) => {
        if (object instanceof Mesh && ['root-body', 'tuft-leaf'].includes(String(object.userData.part))) bounds.expandByObject(object);
      });
      return bounds;
    };
    const matureBounds = bodyBounds(matureRig);
    const ripeBounds = bodyBounds(rig);
    const frameBounds = matureBounds.clone().union(ripeBounds);
    const frameSize = Math.max(frameBounds.max.x - frameBounds.min.x, frameBounds.max.y - frameBounds.min.y) * 48 / 46;
    camera.left = -frameSize / 2; camera.right = frameSize / 2;
    camera.top = frameSize / 2; camera.bottom = -frameSize / 2;
    camera.position.set(0, 0, frameSize * 3); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    scene.add(new AmbientLight(palette.lighting.day['fill-sky'], 1));
    const readBodySilhouette = (target: typeof rig, bounds: Box3) => {
      target.root.position.sub(bounds.getCenter(new Vector3()));
      target.root.updateMatrixWorld(true);
      scene.add(target.root);
      silhouetteRenderer.render(scene, camera);
      const gl = silhouetteRenderer.getContext();
      gl.finish();
      const pixels = new Uint8Array(48 * 48 * 4);
      gl.readPixels(0, 0, 48, 48, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      scene.remove(target.root);
      return pixels;
    };
    const maturePixels = readBodySilhouette(matureRig, matureBounds);
    const ripePixels = readBodySilhouette(rig, ripeBounds);
    let changedBodyPixels = 0;
    for (let index = 0; index < maturePixels.length; index += 4) {
      if ((maturePixels[index + 3]! > 10) !== (ripePixels[index + 3]! > 10)) changedBodyPixels += 1;
    }
    silhouetteCanvas.dataset.stageBodyPixelDifference = String(changedBodyPixels);
    const height = ripeBounds.max.y - ripeBounds.min.y;
    silhouetteCanvas.dataset.projectedHeight = String(height / frameSize * 48);
    rig.root.updateMatrixWorld(true);
    scene.add(rig.root); silhouetteRenderer.render(scene, camera);
    cleanup.push(() => { matureRig.dispose(); rig.dispose(); silhouetteMaterial.dispose(); silhouetteRenderer.dispose(); });
    return;
  }
  const bounds = new Box3().setFromObject(rig.root);
  const center = bounds.getCenter(new Vector3());
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  rig.root.position.sub(center);
  const silhouetteMargin = 1.3;
  const frameSize = Math.max(width, height) * silhouetteMargin;
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
  const portraitRowCenters = [26, 201, 376, 551, 751];
  const rigs = stages.map((stage, index) => {
    const holder = new Group();
    holder.scale.setScalar(1.55); scene.add(holder);
    const rig = makeRig(materialLibrary, index * 410);
    rig.update({ speciesId, plantedAt: 0, stage, progress: progress[index]! }, 0, true);
    rig.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(rig.root);
    const centerY = portrait
      ? 4.4 - portraitRowCenters[index]! / innerHeight * 8.8
      : -2.55 - bounds.min.y * 1.55;
    holder.position.set(portrait ? -0.45 : (index - 2) * 1.92, centerY - bounds.getCenter(new Vector3()).y * 1.55, 0);
    holder.add(rig.root); return rig;
  });
  status.dataset.stageHeights = JSON.stringify(rigs.map((rig) => {
    rig.root.updateMatrixWorld(true);
    const bounds = new Box3();
    if (speciesId === 'twistroot') {
      rig.root.traverse((object) => {
        if (object instanceof Mesh && ['root-body', 'tuft-leaf'].includes(String(object.userData.part))) bounds.expandByObject(object);
      });
    } else {
      bounds.setFromObject(rig.root);
    }
    return bounds.max.y - bounds.min.y;
  }));
  const initialPoses = rigs.map((rig) => {
    rig.root.updateMatrixWorld(true);
    const pose: number[] = [];
    rig.root.traverse((object) => {
      pose.push(...object.matrixWorld.toArray());
      if (object instanceof Mesh && object.userData.part === 'root-body') {
        pose.push(...Array.from(object.geometry.getAttribute('position').array, (value) => Number(value)));
      }
    });
    return pose;
  });
  rigs.forEach((rig, index) => rig.update({ speciesId, plantedAt: 0, stage: stages[index]!, progress: progress[index]! }, 60_000, true));
  status.dataset.reducedMotionStable = String(rigs.every((rig, index) => {
    rig.root.updateMatrixWorld(true);
    const pose: number[] = [];
    rig.root.traverse((object) => {
      pose.push(...object.matrixWorld.toArray());
      if (object instanceof Mesh && object.userData.part === 'root-body') {
        pose.push(...Array.from(object.geometry.getAttribute('position').array, (value) => Number(value)));
      }
    });
    return pose.every((value, item) => value === initialPoses[index]![item]);
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
  const garden = createGarden(); const scene = new Scene(); scene.add(garden);
  const day = palette.lighting.day;
  scene.add(new AmbientLight(day['fill-sky'], 0.25), new HemisphereLight(day['fill-sky'], day['fill-ground'], 0.8));
  const keyLight = new DirectionalLight(day.key, 2.2); keyLight.position.set(-4, 7, 5); scene.add(keyLight);
  const camera = createGardenCamera();
  const plants = createPlantReconciler(garden.plots.slice(0, 6), materials);
  const mixedOrder: PlantSnapshot['speciesId'][] = ['sunny-sprout', 'bubble-berry', 'twistroot', 'sunny-sprout', 'bubble-berry', 'twistroot'];
  const speciesForPlot = (index: number): PlantSnapshot['speciesId'] => mixedSixRipe ? mixedOrder[index]! : speciesId;
  const snapshot: GardenSnapshot = {
    nowMs: 15_000,
    coins: 100, xp: 0, level: 1, levelStartXp: 0, nextLevelXp: 10,
    plots: garden.plots.slice(0, 6).map((plot, index) => ({
      id: plot.plotId,
      plant: { speciesId: speciesForPlot(index), plantedAt: 0, stage: 'Harvestable', progress: 1 },
    })),
  };
  renderer.setSize(innerWidth, innerHeight, false); resizeGardenCamera(camera, innerWidth, innerHeight);
  renderer.render(scene, camera);
  plants.update(snapshot, snapshot, 1, true);
  renderer.render(scene, camera);
  status.dataset.drawCalls = String(renderer.info.render.calls);
  status.dataset.plants = String(garden.plots.slice(0, 6).length);
  status.dataset.speciesOrder = JSON.stringify(snapshot.plots.map(({ plant }) => plant?.speciesId));
  status.dataset.ripe = String(snapshot.plots.filter((plot, index) => plot.plant?.stage === 'Harvestable'
    && garden.plots[index]?.children.some((rig) => rig.name === plot.plant?.speciesId)).length);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); resizeGardenCamera(camera, innerWidth, innerHeight); renderer.render(scene, camera); };
  window.addEventListener('resize', resize);
  cleanup.push(() => { window.removeEventListener('resize', resize); plants.dispose(); garden.dispose(); materials.dispose(); renderer.dispose(); });
}

if (params.has('six-ripe')) renderSixRipeGarden();
else { renderLineup(); renderSilhouette(); }
requestAnimationFrame(() => {
  status.dataset.webglError = String(hasWebGlError(canvas) || (status.dataset.mode !== 'six-ripe' && hasWebGlError(silhouetteCanvas)));
  status.dataset.render = 'complete'; status.dataset.frame = 'ready'; status.textContent = 'Ready';
});
window.addEventListener('pagehide', () => { cleanup.forEach((dispose) => dispose()); });
