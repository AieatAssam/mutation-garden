import {
  AmbientLight,
  Color,
  ColorManagement,
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';
import { createGarden } from './garden';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from './camera';
import { createGardenPicker, type PickResult } from './picking';
import type { GardenSnapshot, PlotId, SimEvent } from '../sim';
import { createPlantReconciler } from './plants/reconcile';
import { createGardenEffects } from './effects';

export interface Renderer {
  resize(width: number, height: number): void;
  pan(deltaXCss: number, deltaYCss: number): void;
  zoom(scale: number): void;
  onEvents(events: readonly SimEvent[], nowMs: number, reducedMotion: boolean): void;
  flickLeaves(plotId: PlotId, nowMs: number, reducedMotion: boolean): void;
  render(previous: GardenSnapshot, current: GardenSnapshot, alpha: number, reducedMotion: boolean): void;
  pick(clientX: number, clientY: number): PickResult;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
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
  const picker = createGardenPicker(canvas, camera, garden);
  const plants = createPlantReconciler(garden.plots, materials);
  const effects = createGardenEffects(garden.plots);
  function draw(): void { gl.render(scene, camera); }

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
    onEvents(events, nowMs, reducedMotion) {
      if (disposed) return;
      effects.trigger(events, nowMs, reducedMotion);
      for (const event of events) {
        if (event.type === 'StageReached' || event.type === 'Harvestable') {
          plants.stageAccent(event.plotId, nowMs, reducedMotion);
        }
      }
    },
    flickLeaves(plotId, nowMs, reducedMotion) {
      if (disposed) return;
      plants.flickLeaves(plotId, nowMs, reducedMotion);
    },
    render(previous, current, alpha, reducedMotion) {
      if (disposed) return;
      plants.update(previous, current, alpha, reducedMotion);
      effects.update(previous.nowMs + (current.nowMs - previous.nowMs) * Math.min(1, Math.max(0, alpha)), reducedMotion);
      draw();
    },
    pick(clientX, clientY) {
      return disposed ? null : picker.pick(clientX, clientY);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      picker.dispose();
      effects.dispose();
      plants.dispose();
      garden.dispose();
      materials.dispose();
      gl.dispose();
    },
  };
}
