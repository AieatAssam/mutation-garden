import { Color, NoToneMapping, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer, Vector3 } from 'three';
import { createPlotStatusResources, PLOT_STATUS_DRAW_CALLS, type PlotStatusDescriptor } from '../../../src/render/plot-status';
import { palette } from '../../../src/render/palette';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Plot status fixture canvas is missing');

const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(new Color(palette.environment['sky-day'].horizon));
renderer.info.autoReset = false;

const scene = new Scene();
const camera = new OrthographicCamera(-1.65, 1.65, 1.65, -1.65, 0.1, 100);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);
function resizeCamera(): void {
  const aspect = window.innerWidth / window.innerHeight;
  // 0.62-unit stamps render at about 28 CSS pixels at both target sizes.
  const width = window.innerWidth / 45;
  const height = width / aspect;
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}
resizeCamera();
window.addEventListener('resize', resizeCamera);
const status = createPlotStatusResources();
const speciesColors = [
  palette.plants['sunny-sprout'].fruit[1],
  palette.plants['bubble-berry'].fruit[1],
  palette.plants.twistroot.fruit[1],
];
const descriptors: PlotStatusDescriptor[] = Array.from({ length: 6 }, (_, index) => {
  // Arrange three columns by two rows, keeping each dial/stamp pair together.
  const column = index % 3;
  const row = Math.floor(index / 3);
  const x = (column - 1) * 1.6;
  const y = row === 0 ? 0.72 : -0.72;
  const color = speciesColors[index % speciesColors.length]!;
  return {
    plotId: `plot-${index + 1}`,
    dial: {
      center: new Vector3(x, y - 0.3, 0),
      progress: (index + 1) / 6,
      color,
      stageFractions: [0.2, 0.55, 0.9],
    },
    stamp: { center: new Vector3(x, y + 0.3, 0), color, ...(index === 0 ? { opacity: 0.4 } : {}) },
  };
});

renderer.render(scene, camera);
const callsWithoutStatus = renderer.info.render.calls;
renderer.info.reset();
scene.add(status.group);
status.update(descriptors);
renderer.render(scene, camera);
document.body.dataset.statusDelta = String(renderer.info.render.calls - callsWithoutStatus);
document.body.dataset.statusBudget = String(PLOT_STATUS_DRAW_CALLS);
document.body.dataset.stampCssSize = String(0.62 * window.innerWidth / (camera.right - camera.left));
document.body.dataset.partialStampOpacity = String(descriptors[0]?.stamp?.opacity);
function viewportPoint(worldX: number, worldY: number): readonly [number, number] {
  return [
    (worldX - camera.left) / (camera.right - camera.left) * window.innerWidth,
    (camera.top - worldY) / (camera.top - camera.bottom) * window.innerHeight,
  ];
}
function stampSample(stampIndex: number, localX: number, localY: number): readonly [number, number] {
  const center = descriptors[stampIndex]!.stamp!.center;
  return viewportPoint(center.x + 0.31 * localX, center.y + 0.31 * localY);
}
const [partialX, partialY] = stampSample(0, 0.5, -0.1);
const [fullX, fullY] = stampSample(3, 0.5, -0.1);
const [paperX, paperY] = stampSample(0, 0.76, 0);
const [fullPaperX, fullPaperY] = stampSample(3, 0.76, 0);
document.body.dataset.partialStampSample = `${partialX},${partialY}`;
document.body.dataset.fullStampSample = `${fullX},${fullY}`;
document.body.dataset.partialPaperSample = `${paperX},${paperY}`;
document.body.dataset.fullPaperSample = `${fullPaperX},${fullPaperY}`;
document.body.dataset.render = 'complete';

type PlotStatusFixtureWindow = Window & {
  setPlotStatusStampState: (opacity: number, faceVisible: boolean) => void;
};
const fixtureWindow = window as unknown as PlotStatusFixtureWindow;
fixtureWindow.setPlotStatusStampState = (opacity, faceVisible) => {
  const updatedDescriptors = descriptors.map((descriptor, index) => index === 0 && descriptor.stamp
    ? { ...descriptor, stamp: { ...descriptor.stamp, opacity } }
    : descriptor);
  status.update(updatedDescriptors);
  const face = status.group.getObjectByName('plot-status-stamp-face');
  if (!face) throw new Error('Plot status stamp face is missing');
  face.visible = faceVisible;
  renderer.render(scene, camera);
};

window.addEventListener('pagehide', () => {
  window.removeEventListener('resize', resizeCamera);
  status.dispose();
  renderer.dispose();
});
