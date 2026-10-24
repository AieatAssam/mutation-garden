import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, OrthographicCamera, Quaternion, Vector3 } from 'three';
import { createInitialState, getSnapshot } from '../sim';
import { createRenderer, type RenderSpecies } from './renderer';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  garden: null as unknown,
  camera: null as unknown,
  materials: null as unknown,
  lifecycleOptions: null as unknown,
  stampDescriptors: [] as unknown[],
  pickerArgs: null as unknown,
  gl: null as unknown,
  plants: null as unknown,
  statusResources: null as unknown,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    outputColorSpace = actual.SRGBColorSpace; toneMapping = actual.NoToneMapping; shadowMap = { enabled: true };
    setPixelRatio = vi.fn(); setClearColor = vi.fn(); setClearAlpha = vi.fn(); setSize = vi.fn();
    render = vi.fn(() => mocks.events.push('draw')); dispose = vi.fn(() => mocks.events.push('gl.dispose'));
    constructor() { mocks.gl = this; }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

vi.mock('./materials', () => ({ createMaterialLibrary: () => (mocks.materials = { dispose: vi.fn(() => mocks.events.push('materials.dispose')) }) }));
vi.mock('./garden', () => ({ createGarden: () => mocks.garden }));
vi.mock('./scenery', () => ({ GARDEN_MODEL_URL: 'garden.glb', loadScenery: () => new Promise(() => {}) }));
vi.mock('./plants/authored', () => ({ PLANT_MODEL_URL: 'plants.glb', loadPlantModels: () => new Promise(() => {}) }));
vi.mock('./camera', () => ({ createGardenCamera: () => mocks.camera, resizeGardenCamera: vi.fn(), panGardenCamera: vi.fn(), zoomGardenCamera: vi.fn(), setGardenCameraExpanded: vi.fn() }));
vi.mock('./plants/reconcile', () => ({ createPlantReconciler: () => mocks.plants }));
vi.mock('./plot-status', () => ({ createPlotStatusResources: () => mocks.statusResources }));
vi.mock('./plot-status-lifecycle', () => ({
  createPlotStatusLifecycle: (options: unknown) => {
    mocks.lifecycleOptions = options;
    return { update: vi.fn(() => mocks.events.push('status.update')), getStampPickDescriptors: () => mocks.stampDescriptors };
  },
}));
vi.mock('./picking', () => ({
  createGardenPicker: (...args: unknown[]) => {
    mocks.pickerArgs = args;
    return { pick: vi.fn(() => { mocks.events.push('pick'); return null; }), dispose: vi.fn(() => mocks.events.push('picker.dispose')) };
  },
}));

const species: readonly RenderSpecies[] = [
  { id: 'sunny-sprout', stageFractions: [0.125, 0.375, 0.875] },
  { id: 'bubble-berry', stageFractions: [2 / 15, 0.4, 13 / 15] },
  { id: 'twistroot', stageFractions: [0.12, 0.4, 0.88] },
];

function setup() {
  mocks.events.length = 0;
  mocks.stampDescriptors = [];
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
  const cameraUpdate = vi.spyOn(camera, 'updateWorldMatrix');
  const garden = new Group() as Group & { plots: (Group & { plotId: string })[]; dispose: () => void };
  garden.plots = Array.from({ length: 6 }, (_, index) => Object.assign(new Group(), { plotId: `plot-${index}` }));
  garden.add(...garden.plots);
  garden.dispose = vi.fn(() => mocks.events.push('garden.dispose'));
  const plants = { update: vi.fn(() => mocks.events.push('plants.update')), getTop: vi.fn(() => true), dispose: vi.fn(() => mocks.events.push('plants.dispose')) };
  const statusGroup = new Group();
  const statusResources = { group: statusGroup, update: vi.fn(), dispose: vi.fn(() => mocks.events.push('status.dispose')) };
  Object.assign(mocks, { camera, garden, plants, statusResources });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const canvas = { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) } as HTMLCanvasElement;
  const renderer = createRenderer(canvas, { species });
  return { renderer, camera, cameraUpdate, garden };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('renderer composition', () => {
  it('updates rigs and status before drawing, and refreshes camera-facing status before picking', () => {
    const h = setup();
    const empty = getSnapshot(createInitialState(1, 1000));
    h.renderer.render(empty, empty, 0.5, true);
    expect(mocks.events.slice(-3)).toEqual(['plants.update', 'status.update', 'draw']);
    expect(h.cameraUpdate).toHaveBeenCalled();
    mocks.events.length = 0;
    const cameraUpdatesBeforePick = h.cameraUpdate.mock.calls.length;
    h.renderer.pick(10, 10);
    expect(mocks.events).toEqual(['status.update', 'pick']);
    expect(h.cameraUpdate.mock.calls.length).toBeGreaterThan(cameraUpdatesBeforePick);
  });

  it.each([
    ['pan', (renderer: ReturnType<typeof setup>['renderer']) => renderer.pan(12, -5)],
    ['zoom', (renderer: ReturnType<typeof setup>['renderer']) => renderer.zoom(1.1)],
    ['resize', (renderer: ReturnType<typeof setup>['renderer']) => renderer.resize(360, 800)],
  ])('refreshes status before drawing after camera %s', (_change, applyCameraChange) => {
    const h = setup();
    const snapshot = getSnapshot(createInitialState(1, 1000));
    h.renderer.render(snapshot, snapshot, 1, false);
    mocks.events.length = 0;
    const cameraUpdatesBefore = h.cameraUpdate.mock.calls.length;

    applyCameraChange(h.renderer);

    expect(mocks.events).toEqual(['status.update', 'draw']);
    expect(h.cameraUpdate.mock.calls.length).toBeGreaterThan(cameraUpdatesBefore);
    h.renderer.dispose();
  });

  it.each([
    ['phone', [10.5, 12.5, 17], [0, 1.3, 0], 0.25682],
    ['desktop', [10.5, 6.8, 14], [-2.6, -1.3, 0], 0.27627],
  ] as const)('uses species descriptors and camera-facing rim geometry on %s', (_viewport, position, target, expectedY) => {
    const h = setup();
    const options = mocks.lifecycleOptions as {
      species: readonly unknown[];
      getDialCenter: (plotId: string, target: Vector3, dialFacing: Quaternion) => boolean;
    };
    expect(options.species).toEqual(species.map((entry) => ({ ...entry, fruitColor: expect.anything() })));
    const plot = h.garden.plots[0]!;
    h.camera.position.set(position[0], position[1], position[2]);
    h.camera.lookAt(new Vector3(target[0], target[1], target[2]));
    h.camera.updateWorldMatrix(true, false);
    const cameraFacing = h.camera.getWorldQuaternion(new Quaternion());
    const dialFacing = cameraFacing.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -35 * Math.PI / 180));
    const dialUp = new Vector3(0, 1, 0).applyQuaternion(dialFacing);
    const dialCenter = new Vector3();
    const rimFoot = () => plot.worldToLocal(dialCenter.clone().addScaledVector(new Vector3(0, 1, 0), -0.12).addScaledVector(dialUp, -0.2));
    expect(options.getDialCenter('plot-0', dialCenter, dialFacing)).toBe(true);
    expect(dialCenter.y).toBeCloseTo(expectedY, 5);
    expect(plot.worldToLocal(dialCenter.clone()).x).toBeCloseTo(-0.3);
    expect(rimFoot().toArray().slice(1).map((value) => Number(value.toFixed(8)))).toEqual([0.05, 0.8]);

    h.garden.position.set(1, 0.5, -0.25);
    h.garden.rotation.y = Math.PI / 6;
    plot.position.set(0.4, 0.2, -0.5);
    plot.rotation.y = Math.PI / 8;
    h.garden.updateMatrixWorld(true);
    expect(options.getDialCenter('plot-0', dialCenter, dialFacing)).toBe(true);
    expect(plot.worldToLocal(dialCenter.clone()).x).toBeCloseTo(-0.3);
    expect(rimFoot().toArray().slice(1).map((value) => Number(value.toFixed(8)))).toEqual([0.05, 0.8]);
    const pickerArgs = mocks.pickerArgs as unknown[];
    expect(pickerArgs).toHaveLength(4);
    const getStamps = pickerArgs[3] as () => readonly unknown[];
    const liveDescriptors = [{ plotId: 'plot-0' }];
    mocks.stampDescriptors = liveDescriptors;
    expect(getStamps()).toBe(liveDescriptors);
    h.renderer.dispose();
  });

  it('disposes every owned renderer resource once and ignores calls after disposal', () => {
    const h = setup();
    h.renderer.dispose();
    h.renderer.dispose();
    h.renderer.render(getSnapshot(createInitialState(1, 0)), getSnapshot(createInitialState(1, 0)), 0, false);
    expect(mocks.events).toEqual([
      'picker.dispose', 'plants.dispose', 'status.dispose', 'garden.dispose', 'materials.dispose', 'gl.dispose',
    ]);
    expect(h.renderer.pick(0, 0)).toBeNull();
  });
});
