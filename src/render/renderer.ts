import {
  AmbientLight,
  ColorManagement,
  DirectionalLight,
  Group,
  HemisphereLight,
  NoToneMapping,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';
import { createGarden } from './garden';
import { GARDEN_MODEL_URL, loadScenery } from './scenery';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from './camera';
import { createGardenPicker, type PickResult } from './picking';
import type { GardenSnapshot, PlotId, SimEvent, SpeciesId } from '../sim';
import { createParticles } from './motion/particles';
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
  pick(clientX: number, clientY: number): PickResult;
  /** Resolves once the authored island and plant models are in the scene (or failed to load). */
  whenLoaded(): Promise<void>;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions): Renderer {
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
  const camera = createGardenCamera();

  const day = palette.lighting.day;
  scene.add(new AmbientLight(day['fill-sky'], 0.25));
  scene.add(new HemisphereLight(day['fill-sky'], day['fill-ground'], 0.8));
  const keyLight = new DirectionalLight(day.key, 2.2);
  keyLight.position.set(-4, 7, 5);
  scene.add(keyLight);

  const materials = createMaterialLibrary();
  const garden = createGarden();
  const sceneryLoaded = loadScenery(GARDEN_MODEL_URL, materials).then(garden.setScenery, (error: unknown) => {
    console.error('Garden model failed to load', error);
  });
  scene.add(garden);
  const plants = createPlantReconciler(garden.plots, materials);
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
  });
  // Compile every shader, plant morph variants included, before reporting ready, so the first
  // frames with the island and first plants do not stall the main thread while the player taps
  // (slow GPUs and CI software rendering).
  const ready = Promise.all([sceneryLoaded, plantsLoaded]).then(async () => {
    if (disposed) return;
    const warm = new Group();
    const rigs = plantModels
      ? (['sunny-sprout', 'bubble-berry', 'twistroot'] as const).map((species) => createAuthoredRig(species, plantModels!, materials))
      : [];
    for (const rig of rigs) {
      rig.update({ speciesId: 'sunny-sprout', plantedAt: 0, stage: 'Harvestable', progress: 1 }, 0, true);
      warm.add(rig.root);
    }
    scene.add(warm);
    try {
      await gl.compileAsync(scene, camera);
    } finally {
      warm.removeFromParent();
      for (const rig of rigs) rig.dispose();
    }
    // Draw once now, so "loaded" means the models are on screen, not waiting for the next frame.
    if (!disposed) draw();
  }).catch((error: unknown) => {
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
  const picker = createGardenPicker(canvas, camera, garden, status.getStampPickDescriptors);
  let previousSnapshot: GardenSnapshot | null = null;
  let currentSnapshot: GardenSnapshot | null = null;
  let snapshotAlpha = 1;
  let currentReducedMotion = false;

  function refreshStatus(): void {
    if (!previousSnapshot || !currentSnapshot) return;
    camera.updateWorldMatrix(true, false);
    const facing = camera.getWorldQuaternion(new Quaternion());
    status.update(currentSnapshot, previousSnapshot, snapshotAlpha, facing, performance.now(), currentReducedMotion);
  }

  const particles = createParticles();
  scene.add(particles.mesh);
  const flights = createHarvestFlights(() => plantModels, materials);
  scene.add(flights.root);
  const effectPoint = new Vector3();

  function playEvents(events: readonly SimEvent[], reducedMotion: boolean): void {
    const now = performance.now();
    for (const event of events) {
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
          flights.launch(event.speciesId, effectPoint, event.size, now, reducedMotion);
          const top = new Vector3();
          const fruit = plants.getTop(event.plotId, top) ? top.setY(top.y - 0.35) : effectPoint.clone().setY(effectPoint.y + 1);
          particles.burst({ origin: fruit, count: 14,
            colors: [ramp(event.speciesId).fruit[0], ramp(event.speciesId).fruit[1], ramp(event.speciesId).leaf[1]],
            speed: 2.2, up: 1.8, gravity: 6, lifeMs: 480, size: 0.15 }, now, reducedMotion);
          break;
        }
        default:
          break;
      }
    }
  }

  function draw(): void {
    const now = performance.now();
    particles.update(now);
    flights.update(now);
    refreshStatus();
    gl.render(scene, camera);
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
      plants.update(previous, current, alpha, reducedMotion);
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
      flights.dispose();
      garden.dispose();
      materials.dispose();
      gl.dispose();
    },
  };
}
