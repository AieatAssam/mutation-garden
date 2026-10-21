import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, MeshToonMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';
import { buildScenery, paletteColor } from './scenery';

function authored(name: string, materialName: string): Mesh {
  const material = new MeshStandardMaterial();
  material.name = materialName;
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = name;
  return mesh;
}

describe('scenery', () => {
  it('resolves palette paths and rejects unknown ones', () => {
    expect(paletteColor('environment.grass.1')).toBe(palette.environment.grass[1]);
    expect(() => paletteColor('environment.grass.9')).toThrow(/Unknown palette path/);
    expect(() => paletteColor('environment.grass')).toThrow(/not a colour/);
  });

  it('swaps authored materials for shared toon materials and builds ink hulls', () => {
    const library = createMaterialLibrary();
    const source = new Group();
    const grass = authored('environment.grass.1', 'environment.grass.1');
    grass.position.set(1, 2, 3);
    source.add(grass, authored('outline-60', 'ink.press-ink'));
    const scenery = buildScenery(source, library);
    const hull = scenery.children.find((child) => child.userData.role === 'scenery-outline') as Mesh;
    const printed = scenery.children.find((child) => child.userData.role === 'scenery') as Mesh;
    expect(scenery.children).toHaveLength(2);
    expect((printed.material as MeshToonMaterial).vertexColors).toBe(true);
    const expected = new Color(palette.environment.grass[1]);
    const colors = printed.geometry.getAttribute('color');
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual(expected.toArray().map((v) => Math.fround(v)));
    printed.geometry.computeBoundingBox();
    expect(printed.geometry.boundingBox!.min.toArray()).toEqual([0.5, 1.5, 2.5]);
    expect(hull.userData.outlineThickness).toBe(0.06);
    expect(() => buildScenery(authored('x', 'not.a.colour'), library)).toThrow();
    scenery.dispose();
    library.dispose();
  });
});
