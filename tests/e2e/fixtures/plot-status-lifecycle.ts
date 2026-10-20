import {
  Color,
  Matrix4,
  NoToneMapping,
  OrthographicCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  Vector3,
  type InstancedMesh,
} from 'three';
import type { GardenSnapshot, PlantSnapshot } from '../../../src/sim';
import { createPlotStatusLifecycle } from '../../../src/render/plot-status-lifecycle';
import { createPlotStatusResources } from '../../../src/render/plot-status';
import { palette } from '../../../src/render/palette';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const body = document.body;
if (!canvas) throw new Error('Plot status lifecycle fixture canvas is missing');

const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(new Color(palette.environment['sky-day'].horizon));

const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const width = window.innerWidth / 45;
  const height = width * window.innerHeight / window.innerWidth;
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

const stageFractions = [0.2, 0.55, 0.9] as const;
const plant: PlantSnapshot = { speciesId: 'sunny-sprout', plantedAt: 0, stage: 'Harvestable', progress: 1 };
const previousPlant: PlantSnapshot = { ...plant, stage: 'Mature', progress: 0.9 };
function snapshot(nowMs: number, plantValue: PlantSnapshot): GardenSnapshot {
  return { nowMs, coins: 100, plots: [{ id: 'lifecycle-plot', plant: plantValue }] };
}

interface Sample {
  readonly label: string;
  readonly elapsedMs: number;
  readonly reducedMotion: boolean;
  readonly x: number;
}

const samples: readonly Sample[] = [
  { label: 'peak', elapsedMs: 127.6, reducedMotion: false, x: -window.innerWidth / 135 },
  { label: 'settled', elapsedMs: 220, reducedMotion: false, x: 0 },
  { label: 'fade', elapsedMs: 60, reducedMotion: true, x: window.innerWidth / 135 },
];

const resources: ReturnType<typeof createPlotStatusResources>[] = [];
const lifecycles = samples.map((sample) => {
  const plotX = sample.x;
  const resource = createPlotStatusResources();
  resources.push(resource);
  scene.add(resource.group);
  const lifecycle = createPlotStatusLifecycle({
    resources: resource,
    species: [{
      id: 'sunny-sprout',
      stageFractions,
      fruitColor: palette.plants['sunny-sprout'].fruit[1],
    }],
    getDialCenter: (_plotId, target) => {
      target.set(plotX, -0.4, 0);
      return true;
    },
    getPlantTop: (_plotId, target) => {
      target.set(plotX, 0.3, 0);
      return true;
    },
  });
  const readyAt = 8_000;
  const start = snapshot(readyAt, plant);
  const previous = snapshot(readyAt, previousPlant);
  lifecycle.update(start, previous, 1, undefined, readyAt, sample.reducedMotion);
  const presentAt = readyAt + sample.elapsedMs;
  lifecycle.update(snapshot(presentAt, plant), start, 1, undefined, presentAt, sample.reducedMotion);
  const picks = lifecycle.getStampPickDescriptors();
  if (picks.length !== 1 || picks[0]?.plotId !== 'lifecycle-plot') {
    throw new Error(`Lifecycle stamp ${sample.label} should remain pickable while entering`);
  }
  return { label: sample.label, lifecycle, picks };
});

function stampScale(label: string): number {
  const index = samples.findIndex((sample) => sample.label === label);
  const ownedMesh = resources[index]?.group.getObjectByName('plot-status-stamp-face') as InstancedMesh | undefined;
  if (!ownedMesh) throw new Error('Plot status stamp face is missing');
  const matrix = new Matrix4();
  ownedMesh.getMatrixAt(0, matrix);
  const scale = new Vector3();
  matrix.decompose(new Vector3(), new Quaternion(), scale);
  return scale.x;
}

function stampOpacity(label: string): number {
  const index = samples.findIndex((sample) => sample.label === label);
  const mesh = resources[index]?.group.getObjectByName('plot-status-stamp-face') as InstancedMesh | undefined;
  const opacity = mesh?.geometry.getAttribute('instanceStatusOpacity');
  if (!opacity) throw new Error('Plot status stamp opacity is missing');
  return opacity.getX(0);
}

const fixtureWindow = window as unknown as Window & {
  readPlotStatusLifecycle: () => { peakScale: number; settledScale: number; fadeScale: number; fadeOpacity: number; pickCount: number };
  presentReducedMotionAt: (elapsedMs: number) => { opacity: number; pickCount: number };
};
fixtureWindow.readPlotStatusLifecycle = () => ({
  peakScale: stampScale('peak') / 0.31,
  settledScale: stampScale('settled') / 0.31,
  fadeScale: stampScale('fade') / 0.31,
  fadeOpacity: stampOpacity('fade'),
  pickCount: lifecycles[2]?.picks.length ?? 0,
});
fixtureWindow.presentReducedMotionAt = (elapsedMs) => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('Elapsed time must be nonnegative and finite');
  const presentAt = 8_000 + elapsedMs;
  const reducedLifecycle = lifecycles[2]?.lifecycle;
  if (!reducedLifecycle) throw new Error('Reduced motion lifecycle is missing');
  reducedLifecycle.update(snapshot(presentAt, plant), snapshot(8_000, plant), 1, undefined, presentAt, true);
  renderer.render(scene, camera);
  return { opacity: stampOpacity('fade'), pickCount: reducedLifecycle.getStampPickDescriptors().length };
};

renderer.render(scene, camera);
body.dataset.render = 'complete';

window.addEventListener('pagehide', () => {
  window.removeEventListener('resize', resize);
  for (const resource of resources) resource.dispose();
  renderer.dispose();
});
