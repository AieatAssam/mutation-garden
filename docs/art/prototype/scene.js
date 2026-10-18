// Seed Packet look prototype. Art-direction reference only, not game code.
// Query: ?dusk  ?desktop  ?bare (no UI)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const DUSK = q.has('dusk');
for (const k of ['dusk', 'desktop', 'bare']) if (q.has(k)) document.body.classList.add(k);

const C = await (await fetch('../palette.json')).json();
const col = (h) => new THREE.Color(h);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // toon look: keep authored colours
document.body.insertBefore(renderer.domElement, document.getElementById('grain'));

const scene = new THREE.Scene();
{ const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
  const sk = DUSK ? C.environment['sky-dusk'] : C.environment['sky-day'];
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, sk.zenith); g.addColorStop(DUSK ? .45 : .38, sk.mid); g.addColorStop(DUSK ? .85 : .78, sk.horizon); g.addColorStop(1, sk.horizon);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // used ONLY by mutation materials

const portrait = innerHeight > innerWidth;
const camera = new THREE.PerspectiveCamera(portrait ? 34 : 30, innerWidth / innerHeight, 0.1, 100);
if (portrait) { camera.position.set(10.5, 10.0, 17.0); camera.lookAt(0, -1.6, 0); }
else { camera.position.set(10.5, 6.8, 14.0); camera.lookAt(-2.6, -1.3, 0); }

// ---------- lighting (palette.lighting) ----------
const L = DUSK ? C.lighting.dusk : C.lighting.day;
scene.add(new THREE.HemisphereLight(col(L['fill-sky']), col(L['fill-ground']), DUSK ? 1.1 : 1.35));
const key = new THREE.DirectionalLight(col(L.key), DUSK ? 2.4 : 2.2);
key.position.set(-5, 9, 6); scene.add(key);

// ---------- toon material + ink outline ----------
const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const toon = (hex, extra = {}) => {
  const m = new THREE.MeshToonMaterial({ color: col(hex), gradientMap: ramp, ...extra });
  // fresnel rim in the warm rim colour, applied after lighting
  m.onBeforeCompile = (s) => {
    s.uniforms.rimColor = { value: col(L.rim) };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace('#include <opaque_fragment>', `
        float rim = 1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0);
        outgoingLight = mix(outgoingLight, rimColor, step(0.78, rim) * 0.35);
        #include <opaque_fragment>`);
  };
  return m;
};
const inkMat = new THREE.ShaderMaterial({
  uniforms: { ink: { value: col(C.ink['press-ink']) }, w: { value: 0.035 } },
  vertexShader: `uniform float w; void main(){ vec3 p = position + normal * w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
  fragmentShader: `uniform vec3 ink; void main(){ gl_FragColor = vec4(ink,1.0); }`,
  side: THREE.BackSide,
});
const inkThick = inkMat.clone(); inkThick.uniforms.w = { value: 0.06 }; inkThick.uniforms.ink = { value: col(C.ink['press-ink']) };
function mesh(geo, mat, { outline = true, thick = false } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); g.add(m);
  if (outline) g.add(new THREE.Mesh(geo, thick ? inkThick : inkMat));
  return g;
}

// ---------- fake soft shadow: one radial blob texture, multiplied ----------
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(58,42,62,0.55)'); g.addColorStop(0.6, 'rgba(58,42,62,0.25)'); g.addColorStop(1, 'rgba(58,42,62,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const blob = (r, x, z, y = 0.01) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); return m;
};

// ---------- island ----------
const E = C.environment;
const island = new THREE.Group(); scene.add(island);
{ // grass cap: thick disc with a lighter rounded lip (reads as a soft tuft edge)
  const R = 4.6;
  island.add(mesh(new THREE.CylinderGeometry(R, R - 0.05, 0.4, 64), toon(E.grass[1])).translateY(-0.2));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.08, 0.16, 8, 72), toon(E.grass[0]));
  lip.rotation.x = Math.PI / 2; lip.position.y = -0.04; island.add(lip);
}
{ // rock underside: jagged lathe, vertex colours sandstone -> mulberry
  const pts = []; const N = 9;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(new THREE.Vector2(Math.max(0.05, 4.55 * Math.pow(1 - t, 0.75)), -0.3 - t * 3.6)); }
  pts.reverse(); // lathe wants bottom-to-top for outward faces
  const g = new THREE.LatheGeometry(pts, 14);
  const pos = g.attributes.position; const colors = []; const ramp5 = E['island-rock'].map(col);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); const t = THREE.MathUtils.clamp((-y - 0.3) / 3.6, 0, 1);
    const n = Math.sin(i * 12.9898) * 43758.5453; const j = (n - Math.floor(n)) - 0.5;
    if (t > 0.02 && t < 0.98) { pos.setX(i, pos.getX(i) * (1 + j * 0.18)); pos.setZ(i, pos.getZ(i) * (1 + j * 0.18)); pos.setY(i, y + j * 0.25); }
    const k = Math.min(3.999, t * 4); const c = ramp5[Math.floor(k)].clone().lerp(ramp5[Math.floor(k) + 1], (k % 1) > 0.5 ? 1 : 0); // banded, not smooth
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
  const geo = g.toNonIndexed(); geo.computeVertexNormals(); // faceted chunks
  island.add(mesh(geo, toon('#ffffff', { vertexColors: true }), { thick: true }));
}
{ // pond
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 32), toon(E.water[2]));
  p.position.set(-2.9, 0.0, 1.9); island.add(p);
  const f = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.07, 6, 32), toon(E.water[0])); f.rotation.x = Math.PI / 2; f.position.set(-2.9, 0.03, 1.9); island.add(f);
  // crate
  const cr = mesh(new RoundedBoxGeometry(0.8, 0.6, 0.8, 2, 0.06), toon(E['wood-crate'][1])); cr.position.set(3.1, 0.3, -1.9); cr.rotation.y = 0.5; island.add(cr);
  island.add(blob(0.75, 3.1, -1.9, 0.012));
}

// ---------- plots: 3 x 2 ----------
const plots = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
  const x = (c - 1) * 2.15, z = (r - 0.5) * 2.15 - 0.15;
  const p = mesh(new RoundedBoxGeometry(1.75, 0.22, 1.75, 3, 0.1), toon(C.environment.soil[1]));
  p.position.set(x, 0.07, z); island.add(p);
  // tilled furrows
  for (let i = -1; i <= 1; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.3, 2, 6), toon(C.environment.soil[0])); f.rotation.z = Math.PI / 2; f.position.set(x, 0.19, z + i * 0.45); island.add(f); }
  plots.push(new THREE.Vector3(x, 0.19, z));
}

// ---------- plants ----------
const PL = C.plants;
function leaf(hex, s = 1) { const g = new THREE.SphereGeometry(0.32 * s, 14, 10); g.scale(1, 0.28, 0.62); return mesh(g, toon(hex)); }
function sunnySprout(fruitMat, fruitOutline = true) {
  const g = new THREE.Group(); const S = PL['sunny-sprout'];
  const stem = mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 8), toon(S.stem[1])); stem.position.y = 0.55; g.add(stem);
  for (const [a, y, s] of [[0.4, 0.35, 1.2], [3.5, 0.55, 1.0]]) { const l = leaf(S.leaf[1], s); l.position.set(Math.cos(a) * 0.38, y, Math.sin(a) * 0.38); l.rotation.y = -a; l.rotation.z = 0.35; g.add(l); }
  // pumpkin-ribbed sun fruit, oversized
  const fg = new THREE.SphereGeometry(0.62, 80, 32); const p = fg.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x); const k = 1 + 0.035 * Math.cos(a * 8); p.setXYZ(i, v.x * k, v.y * 0.86, v.z * k); }
  fg.computeVertexNormals();
  const fruit = mesh(fg, fruitMat, { outline: fruitOutline }); fruit.position.y = 1.55; g.add(fruit);
  const cap = mesh(new THREE.ConeGeometry(0.16, 0.18, 6), toon(S.leaf[2])); cap.position.y = 2.1; g.add(cap);
  return g;
}
function bubbleBerry(berryMat, outline = true) {
  const g = new THREE.Group(); const B = PL['bubble-berry'];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const l = leaf(B.leaf[i % 2 ? 1 : 2], 1.25); l.position.set(Math.cos(a) * 0.42, 0.22, Math.sin(a) * 0.42); l.rotation.y = -a; l.rotation.z = 0.25; g.add(l); }
  const stem = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), toon(B.stem[1])); stem.position.y = 0.4; g.add(stem);
  const spots = [[0, 1.05, 0, 0.36], [0.38, 0.82, 0.12, 0.3], [-0.34, 0.85, 0.18, 0.31], [0.08, 0.78, -0.36, 0.29], [-0.12, 0.66, 0.4, 0.27]];
  for (const [x, y, z, r] of spots) {
    const b = mesh(new THREE.SphereGeometry(r, 24, 16), berryMat, { outline }); b.position.set(x, y, z); g.add(b);
    if (outline) { const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 10, 8), new THREE.MeshBasicMaterial({ color: col(B.accent.highlight) })); hl.scale.set(1, 0.6, 1); hl.position.set(x - r * 0.45, y + r * 0.55, z + r * 0.55); g.add(hl); }
  }
  return g;
}
function twistroot() {
  const g = new THREE.Group(); const T = PL.twistroot;
  // tapered corkscrew tube that bulges out of the soil
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector3(Math.cos(t * 11) * 0.2 * (1 - t * 0.4), t * 1.45, Math.sin(t * 11) * 0.2 * (1 - t * 0.4))); }
  const curve = new THREE.CatmullRomCurve3(pts); const TS = 80, RS = 14;
  const tg = new THREE.TubeGeometry(curve, TS, 0.4, RS, false); const p = tg.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) { const t = i / TS; const c = curve.getPointAt(t); const k = THREE.MathUtils.lerp(1.0, 0.1, Math.pow(t, 1.3));
    for (let j = 0; j <= RS; j++) { const idx = i * (RS + 1) + j; v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c); p.setXYZ(idx, v.x, v.y, v.z); } }
  tg.computeVertexNormals();
  const root = mesh(tg, toon(T.fruit[1])); root.position.y = -0.05; g.add(root);
  const bulb = mesh(new THREE.SphereGeometry(0.48, 24, 16), toon(T.fruit[1])); bulb.scale.set(1.05, 0.75, 1.05); bulb.position.y = 0.12; g.add(bulb);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const f = mesh(new THREE.ConeGeometry(0.07, 0.75, 5), toon(T.leaf[i % 2 ? 0 : 1])); f.position.set(Math.cos(a) * 0.12, 1.75, Math.sin(a) * 0.12); f.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(f); }
  return g;
}
function seedling() { const g = new THREE.Group(); const l1 = leaf(PL['sunny-sprout'].leaf[0], 0.7); l1.position.set(0.12, 0.2, 0); l1.rotation.z = 0.5; const l2 = leaf(PL['sunny-sprout'].leaf[1], 0.7); l2.position.set(-0.12, 0.24, 0); l2.rotation.z = -0.5; g.add(l1, l2); const s = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.25, 6), toon(PL['sunny-sprout'].stem[0])); s.position.y = 0.1; g.add(s); return g; }

const M = C.mutations;
const golden = new THREE.MeshStandardMaterial({ color: col(M.golden.base), metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.4 });
const crystal = new THREE.MeshPhysicalMaterial({ color: col(M.crystal.body), metalness: 0, roughness: 0.04, transmission: 0.92, thickness: 0.6, ior: 1.45, attenuationColor: col(M.crystal.attenuation), attenuationDistance: 0.8, envMap, envMapIntensity: 1.2, flatShading: true, specularIntensity: 1 });

const place = (obj, i, s = 1) => { obj.position.copy(plots[i]); obj.scale.setScalar(s); island.add(obj); island.add(blob(0.75 * s, plots[i].x, plots[i].z, 0.2)); };
place(sunnySprout(toon(PL['sunny-sprout'].fruit[1])), 0);
place(bubbleBerry(toon(PL['bubble-berry'].fruit[1])), 1);
place(twistroot(), 2);
place(sunnySprout(golden, false), 3);           // Golden mutation: breaks out of the print
place(bubbleBerry(crystal, false), 4);           // Crystal mutation
place(seedling(), 5);
// golden sparkle sprites
for (const [dx, dy, dz, s] of [[0.6, 2.0, 0.3, 0.16], [-0.55, 1.4, 0.4, 0.11], [0.2, 2.35, -0.3, 0.09]]) {
  const sp = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), new THREE.MeshBasicMaterial({ color: col(M.golden.sparkle) }));
  sp.scale.set(0.35, 1, 0.35); sp.position.set(plots[3].x + dx, plots[3].y + dy, plots[3].z + dz); island.add(sp);
}
island.position.y = 0;
island.rotation.y = -0.18;

renderer.render(scene, camera);
document.fonts.ready.then(() => { renderer.render(scene, camera); document.body.dataset.ready = '1'; });
