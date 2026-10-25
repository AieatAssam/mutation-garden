import {
  AmbientLight,
  CubeReflectionMapping,
  CubeTexture,
  ColorManagement,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  HemisphereLight,
  NoToneMapping,
  Quaternion,
  Scene,
  RingGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';
import { createGarden } from './garden';
import { GARDEN_MODEL_URL, loadScenery, type Scenery } from './scenery';
import { createGardenCamera, nudgeGardenCamera, panGardenCamera, resizeGardenCamera, setGardenCameraExpanded, zoomGardenCamera } from './camera';
import { createGardenPicker, type PickResult } from './picking';
import type { GardenSnapshot, PlotId, SimEvent, SpeciesId } from '../sim';
import { createParticles } from './motion/particles';
import { createAmbient, type Ambient } from './ambient';
import { createPlotPulse } from './plot-pulse';
import { createHarvestFlights } from './harvest-flight';
import { createPlantReconciler } from './plants/reconcile';
import { createAuthoredRig, loadPlantModels, PLANT_MODEL_URL, type PlantModels } from './plants/authored';
import { createPlotStatusResources } from './plot-status';
import { createPlotStatusLifecycle, type PlotStatusSpecies } from './plot-status-lifecycle';

export interface RenderSpecies {
  readonly id: SpeciesId;
  readonly stageFractions: readonly [number, number, number];
}

export interface RendererOptions {
  readonly species: readonly RenderSpecies[];
  /** Presentation clock in ms; fixtures pass a manual one so frames are repeatable. Defaults to performance.now. */
  readonly now?: () => number;
}

export interface Renderer {
  resize(width: number, height: number): void;
  pan(deltaXCss: number, deltaYCss: number): void;
  zoom(scale: number): void;
  render(previous: GardenSnapshot, current: GardenSnapshot, alpha: number, reducedMotion: boolean): void;
  /** Plays planting, growth, watering and harvest effects for one batch of sim events. */
  onEvents(events: readonly SimEvent[], reducedMotion: boolean): void;
  /** Screen point (CSS px, viewport) just above a plot's plant, for UI rewards. */
  projectPlot(plotId: PlotId): { x: number; y: number } | null;
  projectStall(): { x: number; y: number } | null;
  shiver(plotId: PlotId, durationMs: number): void;
  nudge?(): void;
  pick(clientX: number, clientY: number): PickResult;
  /** Resolves once the authored island and plant models are in the scene (or failed to load). */
  whenLoaded(): Promise<void>;
  dispose(): void;
}

const INTRO_MS = 900;
const PIXEL_RATIO_PROBE_FRAMES = 3;
/** A frame slower than this at full resolution (60 fps leaves 16.7 ms) drops the pixel ratio to 1. */
const SLOW_FRAME_MS = 14;
const ISLAND_WAIT_Y = 60;

/** Island height offset during the drop-in: falls 3.5 units in 450 ms, then one small bounce. */
export function islandDropY(elapsedMs: number): number {
  if (!(elapsedMs >= 0) || elapsedMs >= INTRO_MS) return 0;
  if (elapsedMs < 450) return 3.5 * (1 - (elapsedMs / 450) ** 2);
  return 0.16 * Math.sin(Math.PI * (elapsedMs - 450) / 450);
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions): Renderer {
  const clock = options.now ?? (() => performance.now());
  ColorManagement.enabled = true;
  const gl = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = NoToneMapping;
  gl.shadowMap.enabled = false;
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gl.setClearAlpha(0);
  const sky = palette.environment['sky-day'];
  canvas.style.background = `linear-gradient(180deg, ${sky.zenith} 0%, ${sky.mid} 45%, ${sky.horizon} 85%)`;

  const scene = new Scene();
  let environment: CubeTexture | null = null;
  if (typeof document !== 'undefined') {
    environment = new CubeTexture(Array.from({ length: 6 }, () => {
      const face = document.createElement('canvas'); face.width = face.height = 16;
      const context = face.getContext('2d')!;
      const gradient = context.createLinearGradient(0, 0, 0, 16);
      gradient.addColorStop(0, sky.zenith); gradient.addColorStop(0.55, sky.mid); gradient.addColorStop(1, sky.horizon);
      context.fillStyle = gradient; context.fillRect(0, 0, 16, 16);
      return face;
    }));
    environment.mapping = CubeReflectionMapping;
    environment.colorSpace = SRGBColorSpace;
    environment.needsUpdate = true;
    scene.environment = environment;
  }
  const camera = createGardenCamera();

  const day = palette.lighting.day;
  scene.add(new AmbientLight(day['fill-sky'], 0.25));
  scene.add(new HemisphereLight(day['fill-sky'], day['fill-ground'], 0.8));
  const keyLight = new DirectionalLight(day.key, 2.2);
  keyLight.position.set(-4, 7, 5);
  scene.add(keyLight);

  const materials = createMaterialLibrary();
  const garden = createGarden();
  let introStartMs = -Infinity;
  let islandLanded = false;
  let scenery: Scenery | null = null;
  let ambient: Ambient | null = null;
  const sceneryLoaded = loadScenery(GARDEN_MODEL_URL, materials).then((loaded) => {
    if (disposed) {
      loaded.dispose();
      return;
    }
    scenery = loaded;
    garden.setScenery(loaded);
    ambient = createAmbient(loaded.creatures);
    scene.add(ambient.group);
  }, (error: unknown) => {
    console.error('Garden model failed to load', error);
  });
  scene.add(garden);
  const plants = createPlantReconciler(garden.plots, materials, { waitForModels: true, camera });
  let plantModels: PlantModels | null = null;
  const plantsLoaded = loadPlantModels(PLANT_MODEL_URL).then((models) => {
    if (disposed) {
      models.dispose();
      return;
    }
    plantModels = models;
    plants.setModels(models);
  }, (error: unknown) => {
    console.error('Plant models failed to load', error);
    plants.setModels(null);
  });
  // Compile every shader, plant morph variants included, before reporting ready, so the first
  // frames with the island and first plants do not stall the main thread while the player taps
  // (slow GPUs and CI software rendering).
  const ready = Promise.all([sceneryLoaded, plantsLoaded]).then(async () => {
    if (disposed) return;
    const warm = new Group();
    const rigs = plantModels ? options.species.map(({ id }) => createAuthoredRig(id, plantModels!, materials)) : [];
    for (const rig of rigs) {
      rig.update({ speciesId: rig.root.name as SpeciesId, plantedAt: 0, stage: 'Harvestable', progress: 1,
        mutations: rig.root.name === 'sunny-sprout' ? ['golden'] : rig.root.name === 'puffcap' ? ['glowing'] : [] }, 0, true);
      warm.add(rig.root);
    }
    scene.add(warm);
    try {
      await gl.compileAsync(scene, camera);
    } finally {
      warm.removeFromParent();
      for (const rig of rigs) rig.dispose();
    }
    if (disposed) return;
    choosePixelRatio();
    // The island drops in once everything is ready (design.md 3, 0 s); "loaded" waits for it to land,
    // so the first tap never meets a moving garden. Reduced motion skips the drop.
    if (disposed) return;
    introStartMs = clock();
    draw();
    if (!currentReducedMotion) await new Promise((resolve) => setTimeout(resolve, INTRO_MS));
    introStartMs = -Infinity;
    islandLanded = true;
    // Draw once now, so "loaded" means the models are on screen at rest, not waiting for the next frame.
    if (!disposed) draw();
  }).catch((error: unknown) => {
    islandLanded = true;
    console.error('Shader warm-up failed', error);
  });
  const statusResources = createPlotStatusResources();
  scene.add(statusResources.group);
  const statusSpecies: readonly PlotStatusSpecies[] = options.species.map((species) => ({
    ...species,
    fruitColor: palette.plants[species.id].fruit[1],
  }));
  const plotsById = new Map(garden.plots.map((plot) => [plot.plotId, plot]));
  const status = createPlotStatusLifecycle({
    resources: statusResources,
    species: statusSpecies,
    getDialCenter(plotId, target, dialFacing) {
      const plot = plotsById.get(plotId);
      if (!plot) return false;
      // The bed spans ±0.875 with its soil opening ending at ±0.725.
      // Keep the dial centre 0.30 units left of the bed centre as its face tilts.
      const worldUp = new Vector3(0, 1, 0);
      const dialUp = worldUp.clone().applyQuaternion(dialFacing);
      const inversePlotFacing = plot.getWorldQuaternion(new Quaternion()).invert();
      const localDialUp = dialUp.clone().applyQuaternion(inversePlotFacing);
      const localWorldUp = worldUp.clone().applyQuaternion(inversePlotFacing);
      const footX = -0.30 - 0.20 * localDialUp.x - 0.12 * localWorldUp.x;
      plot.localToWorld(target.set(footX, 0.05, 0.80));
      target.addScaledVector(worldUp, 0.12).addScaledVector(dialUp, 0.20);
      return true;
    },
    getPlantTop: plants.getTop,
  });
  const picker = createGardenPicker(canvas, camera, garden, status.getStampPickDescriptors,
    () => garden.getObjectByName('stall') ?? null);
  let previousSnapshot: GardenSnapshot | null = null;
  let currentSnapshot: GardenSnapshot | null = null;
  let snapshotAlpha = 1;
  let currentReducedMotion = false;

  function refreshStatus(): void {
    if (!previousSnapshot || !currentSnapshot) return;
    camera.updateWorldMatrix(true, false);
    const facing = camera.getWorldQuaternion(new Quaternion());
    status.update(currentSnapshot, previousSnapshot, snapshotAlpha, facing, clock(), currentReducedMotion);
  }

  const particles = createParticles();
  const lastTell = new Map<PlotId, number>();
  scene.add(particles.mesh);
  const pulse = createPlotPulse();
  const flights = createHarvestFlights(() => plantModels, materials);
  scene.add(flights.root);
  const stallRingMaterial = new MeshBasicMaterial({ color: palette.ui.coin.face, transparent: true, depthWrite: false });
  const saleProgress = { value: 0 };
  stallRingMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.saleProgress = saleProgress;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 saleUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsaleUv = uv - vec2(0.5);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float saleProgress;\nvarying vec2 saleUv;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat saleAngle = mod(atan(saleUv.x, saleUv.y) + 6.2831853, 6.2831853) / 6.2831853;\nif (saleAngle > saleProgress) discard;');
  };
  stallRingMaterial.customProgramCacheKey = () => 'stall-sale-progress-v1';
  const stallRing = new Mesh(new RingGeometry(0.17, 0.23, 48), stallRingMaterial);
  stallRing.name = 'stall-sale-progress';
  stallRing.renderOrder = 4;
  stallRing.visible = false;
  scene.add(stallRing);
  const effectPoint = new Vector3();

  function playEvents(events: readonly SimEvent[], reducedMotion: boolean): void {
    const now = clock();
    for (const event of events) {
      if (event.type === 'FruitSold') {
        const stall = scenery?.stall;
        if (stall) flights.sell(event.speciesId, new Vector3(2.75, 1.05, 0.75), stall.localToWorld(new Vector3(0, 0.69, 0.24)), now, reducedMotion);
        continue;
      }
      if (!('plotId' in event) || event.type === 'CommandRejected') continue;
      const anchor = plotsById.get(event.plotId);
      if (!anchor) continue;
      anchor.getWorldPosition(effectPoint);
      const ramp = (species: SpeciesId) => palette.plants[species];
      switch (event.type) {
        case 'Planted':
          particles.burst({ origin: effectPoint.clone().setY(effectPoint.y + 0.05), count: 9,
            colors: palette.environment.soil.slice(0, 3), speed: 1.4, up: 1.2, gravity: 5, lifeMs: 380, size: 0.15 }, now, reducedMotion);
          break;
        case 'StageReached':
        case 'Harvestable': {
          const species = currentSnapshot?.plots.find(({ id }) => id === event.plotId)?.plant?.speciesId;
          if (!species) break;
          const top = new Vector3();
          if (!plants.getTop(event.plotId, top)) top.copy(effectPoint);
          particles.burst({ origin: top, count: event.type === 'Harvestable' ? 12 : 6,
            colors: event.type === 'Harvestable'
              ? [ramp(species).fruit[0], palette.ink['paper-white'], ramp(species).fruit[1]]
              : [ramp(species).leaf[0], ramp(species).leaf[1]],
            speed: 1.1, up: 1.6, gravity: 4, lifeMs: 450, size: 0.12 }, now, reducedMotion);
          break;
        }
        case 'Watered':
          particles.burst({ origin: effectPoint.clone().setY(effectPoint.y + 1.3), count: 14,
            colors: [palette.environment.water[0], palette.environment.water[1]], speed: 0.5, up: -1.5, gravity: 7,
            lifeMs: 420, size: 0.11 }, now, reducedMotion);
          break;
        case 'Harvested': {
          pulse.harvested(event.plotId, now);
          flights.launch(event.speciesId, effectPoint, event.size, now, reducedMotion);
          const top = new Vector3();
          const fruit = plants.getTop(event.plotId, top) ? top.setY(top.y - 0.35) : effectPoint.clone().setY(effectPoint.y + 1);
          particles.burst({ origin: fruit, count: 14,
            colors: [ramp(event.speciesId).fruit[0], ramp(event.speciesId).fruit[1], ramp(event.speciesId).leaf[1]],
            speed: 2.2, up: 1.8, gravity: 6, lifeMs: 480, size: 0.15 }, now, reducedMotion);
          break;
        }
        case 'Mutated': {
          const top = new Vector3();
          if (plants.getTop(event.plotId, top)) {
            if (event.firstDiscovery && !reducedMotion) plants.shiver(event.plotId, currentSnapshot?.nowMs ?? 0, 300);
            const trait = event.mutations[0];
            const colors = trait === 'giant' ? [palette.ui.coin.emboss, palette.ink['paper-white']]
              : trait === 'golden' ? palette.plants[event.speciesId].fruit.slice(0, 2)
                : trait === 'crystal' ? [palette.mutations.crystal.body, palette.mutations.crystal.edge]
                  : trait === 'rainbow' ? palette.mutations.rainbow
                    : [palette.environment.water[0], palette.environment.water[1]];
            particles.burst({ origin: top, count: event.firstDiscovery ? 16 : 7, colors,
              speed: 0.8, up: 1.1, gravity: 2, lifeMs: event.firstDiscovery ? 1000 : 500, size: 0.1 }, now, reducedMotion);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  function draw(): void {
    // The production e2e probe opts in; normal play avoids per-frame DOM writes.
    if ((window as Window & { __gardenTestCameraProbe?: boolean }).__gardenTestCameraProbe) {
      canvas.dataset.cameraPose = [...camera.position.toArray(), camera.zoom].map((value) => value.toFixed(6)).join(',');
    }
    const now = clock();
    const snapshot = currentSnapshot;
    const stall = scenery?.stall;
    stallRing.visible = Boolean(stall && snapshot?.selling && snapshot.nextSaleTime !== null);
    if (stall && snapshot && stallRing.visible) {
      stallRing.position.copy(stall.localToWorld(new Vector3(0, 0.92, 0.24)));
      stallRing.quaternion.copy(camera.quaternion);
      saleProgress.value = Math.max(0, Math.min(1, 1 - ((snapshot.nextSaleTime ?? snapshot.nowMs) - snapshot.nowMs) / (snapshot.saleIntervalMs ?? 1_200)));
    }
    // Until the drop starts the island waits far above the view (still compiled, just off screen).
    garden.position.y = islandLanded || currentReducedMotion ? 0
      : introStartMs === -Infinity ? ISLAND_WAIT_Y : islandDropY(now - introStartMs);
    scenery?.update(now, currentReducedMotion);
    ambient?.update(now, currentReducedMotion);
    pulse.update(currentSnapshot, plotsById, now, currentReducedMotion);
    particles.update(now);
    flights.update(now);
    refreshStatus();
    gl.render(scene, camera);
  }

  /**
   * Adaptive resolution (architecture.md, performance): time a few synced frames of the full island
   * once, before "ready", and drop to 1× if they are slow. Deciding once keeps the picture stable.
   */
  function choosePixelRatio(): void {
    // A manual clock means a fixture wants repeatable frames; keep the resolution it asked for.
    if (gl.getPixelRatio() <= 1 || options.now) return;
    const context = gl.getContext();
    const pixel = new Uint8Array(4);
    const wait = garden.position.y;
    garden.position.y = 0;
    gl.render(scene, camera);
    context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
    const start = performance.now();
    for (let frame = 0; frame < PIXEL_RATIO_PROBE_FRAMES; frame += 1) {
      gl.render(scene, camera);
      context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
    }
    garden.position.y = wait;
    if ((performance.now() - start) / PIXEL_RATIO_PROBE_FRAMES > SLOW_FRAME_MS) {
      const size = gl.getSize(new Vector2());
      gl.setPixelRatio(1);
      gl.setSize(size.x, size.y, false);
    }
  }

  function layout(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    resizeGardenCamera(camera, width, height);
    gl.setSize(width, height, false);
    draw();
  }

  let disposed = false;
  return {
    resize(width, height) {
      if (!disposed) layout(width, height);
    },
    pan(deltaXCss, deltaYCss) {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
        !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
        rect.width <= 0 || rect.height <= 0) return;
      panGardenCamera(camera, deltaXCss, deltaYCss, rect.width, rect.height);
      draw();
    },
    zoom(scale) {
      if (disposed) return;
      zoomGardenCamera(camera, scale);
      draw();
    },
    render(previous, current, alpha, reducedMotion) {
      if (disposed) return;
      previousSnapshot = previous;
      currentSnapshot = current;
      snapshotAlpha = Math.min(1, Math.max(0, alpha));
      currentReducedMotion = reducedMotion;
      const expanded = current.plots.length > 6;
      scenery?.setExpanded(expanded, clock(), reducedMotion);
      setGardenCameraExpanded(camera, expanded);
      for (const plot of garden.plots) {
        const unlocked = current.plots.some((entry) => entry.id === plot.plotId);
        plot.visible = unlocked;
        plot.userData.locked = !unlocked;
      }
      plants.update(previous, current, alpha, reducedMotion);
      const activeTells = new Set<PlotId>();
      for (const plot of current.plots) {
        const plant = plot.plant;
        if (!plant?.tell || (plant.stage !== 'Sprout' && plant.stage !== 'Growing' && plant.stage !== 'Mature' && plant.stage !== 'Harvestable')) continue;
        activeTells.add(plot.id);
        const last = lastTell.get(plot.id) ?? -Infinity;
        if ((reducedMotion && lastTell.has(plot.id)) || last + 4000 > clock()) continue;
        const top = new Vector3();
        if (plants.getTop(plot.id, top)) particles.burst({ origin: top, count: 1,
          colors: plant.tell === 'giant' ? [palette.ui.coin.emboss] : [palette.environment.water[0]],
          speed: 0, up: reducedMotion ? 0 : 0.18, gravity: reducedMotion ? 0 : 0.1,
          lifeMs: reducedMotion ? 1_000_000_000 : 600, size: 0.055 }, clock(), reducedMotion);
        lastTell.set(plot.id, clock());
      }
      for (const plotId of lastTell.keys()) if (!activeTells.has(plotId)) lastTell.delete(plotId);
      draw();
    },
    whenLoaded() {
      return ready;
    },
    onEvents(events, reducedMotion) {
      if (!disposed) playEvents(events, reducedMotion);
    },
    projectPlot(plotId) {
      const anchor = plotsById.get(plotId);
      if (disposed || !anchor) return null;
      const rect = canvas.getBoundingClientRect();
      camera.updateMatrixWorld(true);
      const point = anchor.getWorldPosition(new Vector3()).setY(anchor.position.y + 1.2).project(camera);
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    },
    projectStall() {
      const stall = scenery?.stall;
      if (!stall) return null;
      const point = stall.localToWorld(new Vector3(0, 0.69, 0.24)).project(camera);
      const rect = canvas.getBoundingClientRect();
      return point.z >= -1 && point.z <= 1
        ? { x: (point.x + 1) * rect.width / 2 + rect.left, y: (1 - point.y) * rect.height / 2 + rect.top }
        : null;
    },
    shiver(plotId, durationMs) {
      if (!disposed && !currentReducedMotion) plants.shiver(plotId, currentSnapshot?.nowMs ?? 0, durationMs);
    },
    nudge() {
      if (!disposed && !currentReducedMotion) nudgeGardenCamera(camera, 0.02);
    },
    pick(clientX, clientY) {
      if (disposed) return null;
      refreshStatus();
      return picker.pick(clientX, clientY);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      picker.dispose();
      plants.dispose();
      plantModels?.dispose();
      statusResources.dispose();
      particles.dispose();
      ambient?.dispose();
      pulse.dispose();
      flights.dispose();
      garden.dispose();
      materials.dispose();
      environment?.dispose();
      gl.dispose();
    },
  };
}
