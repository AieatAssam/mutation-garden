import {
  AmbientLight,
  Color,
  ColorManagement,
  DirectionalLight,
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
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from './camera';
import { createGardenPicker, type PickResult } from './picking';
import type { GardenSnapshot, SpeciesId } from '../sim';
import { createPlantReconciler } from './plants/reconcile';
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
  pick(clientX: number, clientY: number): PickResult;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions): Renderer {
  ColorManagement.enabled = true;
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = NoToneMapping;
  gl.shadowMap.enabled = false;
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gl.setClearColor(new Color(palette.environment['sky-day'].horizon));

  const scene = new Scene();
  const camera = createGardenCamera();

  const day = palette.lighting.day;
  scene.add(new AmbientLight(day['fill-sky'], 0.25));
  scene.add(new HemisphereLight(day['fill-sky'], day['fill-ground'], 0.8));
  const keyLight = new DirectionalLight(day.key, 2.2);
  keyLight.position.set(-4, 7, 5);
  scene.add(keyLight);

  const materials = createMaterialLibrary();
  const garden = createGarden(materials);
  scene.add(garden);
  const plants = createPlantReconciler(garden.plots, materials);
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

  function draw(): void {
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
      statusResources.dispose();
      garden.dispose();
      materials.dispose();
      gl.dispose();
    },
  };
}
