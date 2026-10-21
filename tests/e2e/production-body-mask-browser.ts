import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { createGardenCamera, resizeGardenCamera } from '../../src/render/camera';
import { createGarden } from '../../src/render/garden';
import { createMaterialLibrary } from '../../src/render/materials';
import { createBubbleBerry } from '../../src/render/plants/bubble-berry';
import { createSunnySprout } from '../../src/render/plants/sunny-sprout';
import { createTwistroot } from '../../src/render/plants/twistroot';

type Box = { x: number; y: number; width: number; height: number };
type SpeciesId = 'sunny-sprout' | 'bubble-berry' | 'twistroot';
type Input = { speciesId: SpeciesId; plotId: number; stage: Box; crop: Box };
type MaskPair = { mature: Uint8Array; harvestable: Uint8Array };

export function captureVisibleBodyMasksInBrowser({ speciesId, plotId, stage, crop }: Input): MaskPair {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(120, 120, false);
  renderer.autoClear = false;
  const camera = createGardenCamera();
  resizeGardenCamera(camera, stage.width, stage.height);
  camera.setViewOffset(stage.width, stage.height, crop.x - stage.x, crop.y - stage.y, 120, 120);
  camera.updateMatrixWorld(true);
  const materials = createMaterialLibrary();
  const garden = createGarden(materials);
  const scene = new Scene();
  scene.add(garden);
  garden.updateMatrixWorld(true);
  const anchor = garden.plots[plotId]!;
  const target = new WebGLRenderTarget(120, 120, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const depthOnly = new MeshDepthMaterial({ colorWrite: false, depthWrite: true });
  const pixels = new Uint8Array(120 * 120 * 4);
  const rig = speciesId === 'sunny-sprout'
    ? createSunnySprout(materials)
    : speciesId === 'bubble-berry' ? createBubbleBerry(materials) : createTwistroot(materials);
  anchor.add(rig.root);
  garden.updateMatrixWorld(true);
  scene.attach(rig.root);

  const bodyMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, toneMapped: false });
  const excludedMeshes: Mesh[] = [];
  const bodyMeshes: Mesh[] = [];
  const soilOccluders: Mesh[] = [];
  rig.root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    const part = String(mesh.userData.part ?? '');
    if (part === 'soil-bulge' || part === 'soil-bulge-outline') {
      mesh.visible = false;
      excludedMeshes.push(mesh);
      soilOccluders.push(mesh);
      return;
    }
    if (part === 'blob' || part === 'halo' || part === 'ripe-halo'
      || (part.includes('outline') && !part.startsWith('growth-ring-outline'))) {
      mesh.visible = false;
      excludedMeshes.push(mesh);
      return;
    }
    mesh.material = bodyMaterial;
    bodyMeshes.push(mesh);
  });

  const renderPose = (stageName: 'Mature' | 'Harvestable', progress: number): Uint8Array => {
    rig.update({ speciesId, plantedAt: 0, stage: stageName, progress }, 0, true);
    const authoredVisibility = bodyMeshes.map((mesh) => mesh.visible);
    for (const mesh of excludedMeshes) mesh.visible = false;
    if (excludedMeshes.some((mesh) => mesh.visible)) throw new Error('Excluded halo, shadow, soil, and outline meshes must not enter plant-body masks');
    garden.visible = true;
    rig.root.visible = true;
    for (const mesh of bodyMeshes) mesh.visible = false;
    for (const mesh of soilOccluders) mesh.visible = true;
    scene.overrideMaterial = depthOnly;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    for (const mesh of soilOccluders) mesh.visible = false;
    garden.visible = false;
    bodyMeshes.forEach((mesh, index) => { mesh.visible = authoredVisibility[index]!; });
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 120, 120, pixels);
    const mask = new Uint8Array(120 * 120);
    for (let y = 0; y < 120; y += 1) for (let x = 0; x < 120; x += 1) {
      const source = ((119 - y) * 120 + x) * 4;
      mask[y * 120 + x] = pixels[source]! > 127 && pixels[source + 3]! > 127 ? 1 : 0;
    }
    return mask;
  };

  const mature = renderPose('Mature', 0.95);
  const harvestable = renderPose('Harvestable', 1);
  renderer.setRenderTarget(null);
  renderer.dispose();
  target.dispose();
  depthOnly.dispose();
  bodyMaterial.dispose();
  rig.dispose();
  garden.dispose();
  materials.dispose();
  return { mature, harvestable };
}
