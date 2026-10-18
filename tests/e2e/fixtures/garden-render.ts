import { createRenderer } from '../../../src/render/renderer';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Garden fixture canvas is missing');
const renderer = createRenderer(canvas);
function draw() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', draw);
draw();
document.body.dataset.render = 'complete';
