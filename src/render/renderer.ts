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
import { createGardenCamera, resizeGardenCamera } from './camera';

export interface Renderer {
  resize(width: number, height: number): void;
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

  function layout(width: number, height: number): void {
    resizeGardenCamera(camera, width, height);
    gl.setSize(width, height, false);
    gl.render(scene, camera);
  }

  let disposed = false;
  return {
    resize(width, height) {
      if (!disposed) layout(width, height);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      garden.dispose();
      materials.dispose();
      gl.dispose();
    },
  };
}
