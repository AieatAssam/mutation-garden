import {
  BackSide,
  BufferGeometry,
  Color,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  NoColorSpace,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  type ColorRepresentation,
} from 'three';
import { palette } from './palette';

const GRADIENT_WIDTH = 3;
const GRADIENT_HEIGHT = 1;
const BLOB_SIZE = 128;
const DEFAULT_OUTLINE_THICKNESS = 0.035;
const ROCK_OUTLINE_THICKNESS = 0.06;

export interface MaterialLibrary {
  /** Returns the shared printed material for a palette colour. */
  toon(color: ColorRepresentation): MeshToonMaterial;
  /** Makes a Press Ink back-face hull that borrows the supplied geometry. */
  outline(geometry: BufferGeometry, thickness?: number): Mesh;
  /** Makes a blob shadow using the library's shared quad and material. */
  blob(): Mesh;
  /** Disposes each owned resource once. Safe to call more than once. */
  dispose(): void;
}

function dataTexture(data: Uint8Array, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createGradientTexture(): DataTexture {
  const texture = dataTexture(new Uint8Array([
    90, 90, 90, 255,
    175, 175, 175, 255,
    255, 255, 255, 255,
  ]), GRADIENT_WIDTH, GRADIENT_HEIGHT);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

function createBlobTexture(): DataTexture {
  const data = new Uint8Array(BLOB_SIZE * BLOB_SIZE * 4).fill(255);
  const center = (BLOB_SIZE - 1) / 2;

  for (let y = 0; y < BLOB_SIZE; y += 1) {
    for (let x = 0; x < BLOB_SIZE; x += 1) {
      data[(y * BLOB_SIZE + x) * 4 + 3] = Math.round(
        Math.max(0, 1 - Math.hypot(x - center, y - center) / center) * 255,
      );
    }
  }

  return dataTexture(data, BLOB_SIZE, BLOB_SIZE);
}

export function createMaterialLibrary(): MaterialLibrary {
  const gradient = createGradientTexture();
  const blobTexture = createBlobTexture();
  const blobGeometry = new PlaneGeometry(1, 1);
  const toonMaterials = new Map<string, MeshToonMaterial>();
  const outlineMaterials = new Map<number, MeshBasicMaterial>();
  const blobMaterial = new MeshBasicMaterial({
    color: palette.lighting['blob-shadow'],
    map: blobTexture,
    opacity: 0.55,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  let disposed = false;

  function getOutlineMaterial(thickness: number): MeshBasicMaterial {
    const existing = outlineMaterials.get(thickness);
    if (existing) return existing;

    const material = new MeshBasicMaterial({ color: palette.ink['press-ink'], side: BackSide });
    material.userData.outlineThickness = thickness;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.outlineThickness = { value: thickness };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float outlineThickness;',
      ).replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;',
      );
    };
    material.customProgramCacheKey = () => `seed-packet-outline-v1-${thickness}`;
    outlineMaterials.set(thickness, material);
    return material;
  }

  return {
    toon(color) {
      const key = typeof color === 'string' ? color : JSON.stringify(color);
      const existing = toonMaterials.get(key);
      if (existing) return existing;

      const material = new MeshToonMaterial({ color, gradientMap: gradient });
      const rimColor = new Color(palette.lighting.day.rim);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.seedPacketRimColor = { value: rimColor };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nuniform vec3 seedPacketRimColor;',
        ).replace(
          '#include <opaque_fragment>',
          'float seedPacketFacing = max(dot(normalize(normal), normalize(vViewPosition)), 0.0);\n'
            + 'float seedPacketRim = 1.0 - step(0.22, seedPacketFacing);\n'
            + 'outgoingLight = mix(outgoingLight, seedPacketRimColor, seedPacketRim * 0.35);\n'
            + '#include <opaque_fragment>',
        );
      };
      material.customProgramCacheKey = () => 'seed-packet-toon-rim-v1';
      toonMaterials.set(key, material);
      return material;
    },
    outline(geometry, thickness = DEFAULT_OUTLINE_THICKNESS) {
      const hull = new Mesh(geometry, getOutlineMaterial(thickness));
      hull.userData.outlineThickness = thickness;
      return hull;
    },
    blob() {
      return new Mesh(blobGeometry, blobMaterial);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of toonMaterials.values()) material.dispose();
      toonMaterials.clear();
      for (const material of outlineMaterials.values()) material.dispose();
      outlineMaterials.clear();
      blobMaterial.dispose();
      gradient.dispose();
      blobTexture.dispose();
      blobGeometry.dispose();
    },
  };
}

export { DEFAULT_OUTLINE_THICKNESS, ROCK_OUTLINE_THICKNESS };
