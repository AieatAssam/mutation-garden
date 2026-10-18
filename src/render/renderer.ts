import {
  AmbientLight,
  Color,
  ColorManagement,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';

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
  const camera = new OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const day = palette.lighting.day;
  scene.add(new AmbientLight(day['fill-sky'], 0.25));
  scene.add(new HemisphereLight(day['fill-sky'], day['fill-ground'], 0.8));
  const keyLight = new DirectionalLight(day.key, 2.2);
  keyLight.position.set(-4, 7, 5);
  scene.add(keyLight);

  const materials = createMaterialLibrary();
  const fruitGeometry = new SphereGeometry(0.62, 24, 16);
  const fruitColors = [
    palette.plants['sunny-sprout'].fruit[1],
    palette.plants['bubble-berry'].fruit[1],
    palette.plants.twistroot.fruit[1],
  ];
  const fruitMeshes: Mesh[] = [];
  const blobMeshes: Mesh[] = [];
  const outlineMeshes: Mesh[] = [];

  for (const color of fruitColors) {
    const fruit = new Mesh(fruitGeometry, materials.toon(color));
    const outline = materials.outline(fruitGeometry);
    const blob = materials.blob();
    scene.add(blob, outline, fruit);
    fruitMeshes.push(fruit);
    outlineMeshes.push(outline);
    blobMeshes.push(blob);
  }

  function layout(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    const portrait = aspect < 1;
    const viewHeight = portrait ? 5.6 : 3.8;
    camera.left = -viewHeight * aspect * 0.5;
    camera.right = viewHeight * aspect * 0.5;
    camera.top = viewHeight * 0.5;
    camera.bottom = -viewHeight * 0.5;
    camera.updateProjectionMatrix();

    const positions: readonly (readonly [number, number])[] = portrait
      ? [[0, 1.55], [0, 0], [0, -1.55]]
      : [[-1.65, 0], [0, 0], [1.65, 0]];

    fruitMeshes.forEach((fruit, index) => {
      const position = positions[index];
      if (!position) return;
      const [x, y] = position;
      fruit.position.set(x, y, 0);
      const outline = outlineMeshes[index];
      if (outline) outline.position.copy(fruit.position);
      const blob = blobMeshes[index];
      if (blob) {
        blob.position.set(x, y - 0.64, -0.03);
        blob.scale.set(1.2, 0.32, 1);
      }
    });

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
      materials.dispose();
      fruitGeometry.dispose();
      gl.dispose();
    },
  };
}
