import { AmbientLight, Box3, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { createMaterialLibrary, type MaterialLibrary } from '../../../src/render/materials';
import { createSunnySprout } from '../../../src/render/plants/sunny-sprout';
import { createRenderer } from '../../../src/render/renderer';
import { palette } from '../../../src/render/palette';
import type { GardenSnapshot, PlantSnapshot } from '../../../src/sim';
import { renderOptions } from './render-options';

document.documentElement.style.setProperty('--sky', palette.environment['sky-day'].mid); document.documentElement.style.setProperty('--ink', palette.ink['press-ink']); document.documentElement.style.setProperty('--paper', palette.ink['paper-white']); document.documentElement.style.setProperty('--tomato', palette.ink['misprint-tomato']);
if (new URLSearchParams(location.search).has('reconcile')) {
  document.body.dataset.mode = 'reconcile';
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const motion = document.querySelector<HTMLInputElement>('#reduced-motion')!;
  // A manual presentation clock makes every case's frame repeatable (no idle motion drift between cases).
  let clockMs = 0;
  const renderer = createRenderer(canvas, { ...renderOptions, now: () => clockMs });
  let reducedMotion = false;
  let currentCase = 'empty';
  const snapshot = (nowMs: number, plants: readonly (PlantSnapshot | null)[]): GardenSnapshot => ({ coins: 100, xp: 0, level: 1, levelStartXp: 0, nextLevelXp: 10, nowMs,
    plots: Array.from({ length: 6 }, (_, index) => ({ id: `plot-${index}`, plant: plants[index] ?? null })) });
  const plant = (plantedAt: number, stage: PlantSnapshot['stage'], progress: number): PlantSnapshot => ({ speciesId: 'sunny-sprout', plantedAt, stage, progress });
  const setCase = (name: string) => {
    currentCase = name;
    const none = Array<PlantSnapshot | null>(6).fill(null);
    let previous = snapshot(1000, none); let current = previous;
    if (name === 'growing') { previous = snapshot(1000, [plant(0, 'Growing', 0.4)]); current = snapshot(1100, [plant(0, 'Growing', 0.5)]); }
    if (name === 'harvested') { previous = snapshot(1000, [plant(0, 'Harvestable', 1)]); current = snapshot(1100, none); }
    if (name === 'replanted') { previous = snapshot(1000, [plant(0, 'Growing', 0.8)]); current = snapshot(1100, [plant(1000, 'Seed', 0.08)]); }
    if (name === 'six-plots') {
      const plants = Array.from({ length: 6 }, (_, index) => plant(index * 100, index === 5 ? 'Harvestable' : 'Growing', (index + 1) / 7));
      previous = snapshot(1000, plants); current = snapshot(1100, plants);
    }
    // Every case starts at the same presentation time, then steps 250 ms so short fades (harvested
    // stamps fade over 120 ms) finish before the settled frame.
    clockMs = 10_000;
    renderer.render(previous, current, 0.5, reducedMotion);
    clockMs += 250;
    renderer.render(current, current, 1, reducedMotion);
    status.dataset.case = '';
    requestAnimationFrame(() => { if (currentCase === name) status.dataset.case = name; });
  };
  function resize() { renderer.resize(innerWidth, innerHeight); }
  window.addEventListener('resize', resize); resize(); setCase('empty');
  // Wait for the island and plant models so every case compares like with like.
  await renderer.whenLoaded(); setCase('empty');
  status.dataset.render = 'complete'; status.textContent = 'Ready';
  (window as Window & { sunnySproutFixture?: { setCase(name: string): void; setMotion(value: boolean): void; resize(): void; dispose(): void } }).sunnySproutFixture = {
    setCase,
    setMotion(value) { reducedMotion = value; motion.checked = value; setCase(currentCase); },
    resize,
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
} else {
const stages = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'] as const;
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!; const status = document.querySelector<HTMLElement>('#status')!; const reduced = document.querySelector<HTMLInputElement>('#reduced-motion')!;
const silhouetteCanvas = document.querySelector<HTMLCanvasElement>('#silhouette')!;
const renderer = new WebGLRenderer({ canvas, antialias: true });
const silhouetteRenderer = new WebGLRenderer({ canvas: silhouetteCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true }); silhouetteRenderer.setSize(48, 48, false);
const scene = new Scene();
scene.background = new Color(palette.environment['sky-day'].mid); scene.add(new AmbientLight(palette.lighting.day['fill-sky'], 1.4));
const key = new DirectionalLight(palette.lighting.day.key, 2.2); key.position.set(-3, 5, 4); scene.add(key);
const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 50);
camera.position.set(0, innerWidth < innerHeight ? 9 : 3, 9); camera.lookAt(0, 0, 0);
const materials = createMaterialLibrary();
const floorGeometry = new PlaneGeometry(40, 40);
const floor = new Mesh(floorGeometry, materials.toon(palette.environment.grass[0]));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; scene.add(floor);
const rigs = stages.map((stage, index) => {
  const holder = new Group();
  holder.position.set(innerWidth < innerHeight ? 0 : (index - 2) * 1.35, 0, innerWidth < innerHeight ? (index - 2) * 2 : 0);
  holder.scale.setScalar(0.62); scene.add(holder);
  const rig = createSunnySprout(materials, index * 310); holder.add(rig.root);
  const plant: PlantSnapshot = { speciesId: 'sunny-sprout', plantedAt: 0, stage, progress: [0, 0.24, 0.5, 0.76, 1][index]! };
  return { rig, plant };
});
const silhouetteScene = new Scene(); const silhouetteCamera = new OrthographicCamera(-0.75, 0.75, 0.75, -0.75, 0.1, 10);
const silhouetteMaterial = new MeshBasicMaterial({ color: palette.ink['press-ink'], toneMapped: false });
const silhouetteLibrary: MaterialLibrary = { toon: () => materials.toon(palette.ink['press-ink']), outline: (geometry, thickness) => materials.outline(geometry, thickness), blob: () => materials.blob(), dispose() {} };
const silhouetteRig = createSunnySprout(silhouetteLibrary); const silhouettePlant: PlantSnapshot = { speciesId: 'sunny-sprout', plantedAt: 0, stage: 'Harvestable', progress: 1 };
silhouetteRig.update(silhouettePlant, 0, true); silhouetteRig.root.traverse((object) => { if (!(object instanceof Mesh)) return; if (!object.userData.part || ['halo', 'blob'].includes(object.userData.part)) object.visible = false; else object.material = silhouetteMaterial; });
silhouetteRig.root.updateMatrixWorld(true); const bounds = new Box3(); silhouetteRig.root.traverse((object) => { if (object instanceof Mesh && object.visible) bounds.expandByObject(object); });
const height = bounds.max.y - bounds.min.y; silhouetteRig.root.position.y = -height / 2; silhouetteRig.root.updateMatrixWorld(true);
silhouetteCamera.left = -height / 2; silhouetteCamera.right = height / 2; silhouetteCamera.top = height / 2; silhouetteCamera.bottom = -height / 2; silhouetteCamera.position.set(0, 0, 5); silhouetteCamera.lookAt(0, 0, 0); silhouetteCamera.updateMatrixWorld(true); silhouetteCamera.updateProjectionMatrix();
silhouetteScene.add(silhouetteRig.root);
const projected = [bounds.min.y - height / 2, bounds.max.y - height / 2].map((y) => new Vector3(0, y, 0).project(silhouetteCamera).y); silhouetteCanvas.dataset.projectedHeight = String(Math.abs(projected[1]! - projected[0]!) * 24);
let dead = false;
let paused = false;
let lastFrameNow = 0;
let frameHandle = 0;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); const aspect = innerWidth / innerHeight;
  camera.left = -4 * aspect; camera.right = 4 * aspect; camera.updateProjectionMatrix();
}
function renderFrame(now: number, reducedMotion: boolean) {
  rigs.forEach(({ rig, plant }) => rig.update(plant, now, reducedMotion));
  renderer.render(scene, camera);
  silhouetteRenderer.render(silhouetteScene, silhouetteCamera);
}
function frame(now: number) {
  if (dead || paused) return;
  lastFrameNow = now;
  renderFrame(now, reduced.checked);
  frameHandle = requestAnimationFrame(frame);
}
resize();
window.addEventListener('resize', resize); rigs.forEach(({ rig, plant }) => rig.update(plant, 0, false)); renderer.compile(scene, camera); renderer.render(scene, camera); silhouetteRenderer.compile(silhouetteScene, silhouetteCamera); silhouetteRenderer.render(silhouetteScene, silhouetteCamera);
status.dataset.render = 'complete'; status.textContent = 'Ready'; frameHandle = requestAnimationFrame(frame);
(window as Window & { sunnySproutFixture?: { setMotion(value: boolean): void; pause(): void; dispose(): void } }).sunnySproutFixture = {
  setMotion(value) {
    reduced.checked = value;
    if (paused) {
      renderFrame(lastFrameNow, value);
      status.dataset.motion = value ? 'reduced' : 'default';
    }
  },
  pause() {
    if (!paused) {
      paused = true;
      cancelAnimationFrame(frameHandle);
    }
    renderFrame(lastFrameNow, reduced.checked);
    status.dataset.frame = 'paused';
    status.dataset.motion = reduced.checked ? 'reduced' : 'default';
  },
  dispose() {
    dead = true; paused = true; cancelAnimationFrame(frameHandle); window.removeEventListener('resize', resize); rigs.forEach(({ rig }) => rig.dispose()); silhouetteRig.dispose(); silhouetteMaterial.dispose(); floorGeometry.dispose(); materials.dispose(); renderer.dispose(); silhouetteRenderer.dispose();
  },
};
}
