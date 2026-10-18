import { AmbientLight, Color, Mesh, NoToneMapping, Scene, SphereGeometry, SRGBColorSpace, WebGLRenderer } from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../../src/render/camera';
import { createMaterialLibrary } from '../../../src/render/materials';
import { createDaySky } from '../../../src/render/sky';
import { palette } from '../../../src/render/palette';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Garden fixture canvas is missing');
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.setClearColor(new Color(palette.environment['sky-day'].horizon));
const scene = new Scene();
scene.add(new AmbientLight(palette.lighting.day['fill-sky'], 1));
const sky = createDaySky();
scene.add(sky.mesh);
const materials = createMaterialLibrary();
const camera = createGardenCamera();
['sunny-sprout', 'bubble-berry', 'twistroot'].forEach((plant, index) => {
  const fruit = palette.plants[plant as keyof typeof palette.plants].fruit[1];
  const marker = new Mesh(new SphereGeometry(0.65, 20, 14), materials.toon(fruit));
  marker.position.set((index - 1) * 2, 0, 0);
  scene.add(marker);
});
function draw() {
  resizeGardenCamera(camera, window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.render(scene, camera);
}
window.addEventListener('resize', draw);
draw();
document.body.dataset.render = 'complete';
