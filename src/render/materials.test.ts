import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackSide, BufferGeometry, Color, DataTexture, Mesh, MeshBasicMaterial,
  MeshToonMaterial, NearestFilter, NoColorSpace, PlaneGeometry, RGBAFormat,
  UnsignedByteType,
} from 'three';
import { palette } from './palette';
import { createMaterialLibrary } from './materials';

const libraries: ReturnType<typeof createMaterialLibrary>[] = [];
const library = () => {
  const value = createMaterialLibrary();
  libraries.push(value);
  return value;
};
const image = (texture: DataTexture) =>
  texture.image as { width: number; height: number; data: Uint8Array };
const color = (actual: Color, expected: string) =>
  expect(actual.equals(new Color(expected))).toBe(true);

afterEach(() => libraries.splice(0).forEach((value) => value.dispose()));

describe('createMaterialLibrary', () => {
  it('caches palette toon colors and shares the three-band gradient', () => {
    const lib = library();
    const colors = [
      palette.plants['sunny-sprout'].fruit[1]!,
      palette.plants['bubble-berry'].fruit[1]!,
      palette.plants.twistroot.fruit[1]!,
    ];
    const materials = colors.map((value) => lib.toon(value));
    materials.forEach((material, i) => {
      expect(material).toBeInstanceOf(MeshToonMaterial);
      expect(material).toBe(lib.toon(colors[i]!));
      color(material.color, colors[i]!);
      expect(material.gradientMap).toBe(materials[0]!.gradientMap);
    });
    expect(new Set(materials).size).toBe(colors.length);

    const gradient = materials[0]!.gradientMap as DataTexture;
    expect(image(gradient)).toMatchObject({ width: 3, height: 1 });
    expect(Array.from(image(gradient).data)).toEqual([
      90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255,
    ]);
    expect(gradient).toMatchObject({
      format: RGBAFormat, type: UnsignedByteType, magFilter: NearestFilter,
      minFilter: NearestFilter, generateMipmaps: false, colorSpace: NoColorSpace,
    });
  });

  it('shares outline materials by thickness, borrows geometry and compiles fixed ink variants', () => {
    const lib = library();
    const geometry = new BufferGeometry();
    const defaults = [lib.outline(geometry), lib.outline(geometry)];
    const rock = lib.outline(geometry, 0.06);
    expect([...defaults, rock].map((mesh) => mesh.geometry)).toEqual([geometry, geometry, geometry]);
    expect(defaults[0]!.material).toBe(defaults[1]!.material);
    expect(defaults[0]!.material).not.toBe(rock.material);

    for (const [mesh, thickness] of [[defaults[0]!, 0.035], [rock, 0.06]] as const) {
      const material = mesh.material as MeshBasicMaterial;
      expect(material.side).toBe(BackSide);
      color(material.color, palette.ink['press-ink']);
      expect(mesh.userData.outlineThickness).toBe(thickness);
      expect(material.userData.outlineThickness).toBe(thickness);
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
      material.onBeforeCompile(shader as never, {} as never);
      expect(shader.uniforms).toMatchObject({ outlineThickness: { value: thickness } });
      expect(material.customProgramCacheKey()).toContain(String(thickness));
    }
  });

  it('shares the radial blob quad/material and uses palette tint, alpha and depth settings', () => {
    const lib = library();
    const [first, second] = [lib.blob(), lib.blob()];
    const material = first!.material as MeshBasicMaterial;
    expect(first).toBeInstanceOf(Mesh);
    expect(first!.geometry).toBe(second!.geometry);
    expect(material).toBe(second!.material);
    expect(first!.geometry).toBeInstanceOf(PlaneGeometry);
    expect((first!.geometry as PlaneGeometry).parameters).toMatchObject({ width: 1, height: 1 });
    expect(material).toMatchObject({ transparent: true, depthWrite: false, opacity: 0.55 });
    color(material.color, palette.lighting['blob-shadow']);

    const texture = material.map as DataTexture;
    const pixels = image(texture);
    expect(pixels).toMatchObject({ width: 128, height: 128 });
    expect(texture).toMatchObject({
      format: RGBAFormat, type: UnsignedByteType, colorSpace: NoColorSpace,
    });
    const alpha = (x: number, y: number) => pixels.data[(y * 128 + x) * 4 + 3]!;
    expect(alpha(64, 64)).toBeGreaterThan(250);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(64, 64)).toBeGreaterThan(alpha(64, 0));
  });

  it('disposes every owned resource once and preserves borrowed outline geometry', () => {
    const lib = library();
    const toon = lib.toon(palette.plants.twistroot.fruit[1]!);
    const blob = lib.blob();
    const borrowed = new BufferGeometry();
    const outlines = [lib.outline(borrowed), lib.outline(borrowed, 0.06)];
    const owned = new Set<{ dispose: () => void }>([
      toon, toon.gradientMap!, blob.geometry, blob.material as MeshBasicMaterial,
      (blob.material as MeshBasicMaterial).map!,
      ...outlines.map((mesh) => mesh.material as MeshBasicMaterial),
    ]);
    const disposals = [...owned].map((resource) => vi.spyOn(resource, 'dispose'));
    const borrowedDisposal = vi.spyOn(borrowed, 'dispose');
    lib.dispose();
    lib.dispose();
    expect(disposals.map((spy) => spy.mock.calls.length)).toEqual(disposals.map(() => 1));
    expect(borrowedDisposal).not.toHaveBeenCalled();
  });
});
