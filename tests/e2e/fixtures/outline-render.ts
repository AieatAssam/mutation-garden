import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { createMaterialLibrary } from '../../../src/render/materials';
import { palette } from '../../../src/render/palette';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Outline fixture canvas is missing');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.shadowMap.enabled = false;
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(new Color(palette.environment['sky-day'].horizon));

const scene = new Scene();
const camera = new OrthographicCamera(-2.3, 2.3, 2.3, -2.3, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
scene.add(new AmbientLight(palette.lighting.day['fill-sky'], 0.5));
const key = new DirectionalLight(palette.lighting.day.key, 2.2);
key.position.set(-4, 7, 5);
scene.add(key);

const materials = createMaterialLibrary();
const geometry = new SphereGeometry(0.58, 24, 16);
const colors = [
  palette.plants['sunny-sprout'].fruit[1],
  palette.plants['bubble-berry'].fruit[1],
  palette.plants.twistroot.fruit[1],
];
const thicknesses = [0.047, 0.035, 0.06];
colors.forEach((color, index) => {
  const x = (index - 1) * 1.5;
  const fruit = new Mesh(geometry, materials.toon(color));
  fruit.position.x = x;
  const outline = materials.outline(geometry, thicknesses[index]);
  outline.position.copy(fruit.position);
  scene.add(outline, fruit);
});

renderer.render(scene, camera);
document.body.dataset.render = 'complete';
