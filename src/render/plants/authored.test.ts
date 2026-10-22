import { BoxGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { PlantSnapshot, SpeciesId } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { palette } from '../palette';
import { createAuthoredRig, partGrowth, readPlantModels } from './authored';

/** A stem that grows from 0.1 to 1.0 tall, and a fruit that rides its tip. */
function stem(name: string, materialName: string): Mesh {
  const geometry = new BoxGeometry(0.1, 0.1, 0.1).translate(0, 0.05, 0);
  const position = geometry.getAttribute('position');
  const delta = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) delta[index * 3 + 1] = position.getY(index) * 9;
  geometry.morphAttributes.position = [new Float32BufferAttribute(delta, 3)];
  geometry.morphTargetsRelative = true;
  return part(name, materialName, geometry, { grow_start: 0, grow_end: 0.5, attach: '' });
}

function part(name: string, materialName: string, geometry = new BoxGeometry(0.2, 0.2, 0.2),
  extras: Record<string, unknown> = {}): Mesh {
  const material = new MeshStandardMaterial();
  material.name = materialName;
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = { grow_start: 0.5, grow_end: 1, attach: '', ripe: false, fly: false, ...extras };
  return mesh;
}

function scene(): Group {
  const root = new Group();
  for (const species of ['sunny-sprout', 'bubble-berry', 'twistroot'] as SpeciesId[]) {
    const group = new Group();
    group.name = species;
    const fruit = part(`${species}_fruit`, `plants.${species}.fruit.1`, undefined,
      { attach: `${species}_stem`, ripe: true, fly: true });
    fruit.position.set(0, 1, 0);
    group.add(stem(`${species}_stem`, `plants.${species}.stem.1`), fruit);
    root.add(group);
  }
  return root;
}

const plant = (progress: number, stage: PlantSnapshot['stage']): PlantSnapshot =>
  ({ speciesId: 'sunny-sprout', plantedAt: 0, progress, stage });

describe('authored plants', () => {
  it('grows each part in its own window with a small overshoot', () => {
    const window = { growStart: 0.2, growEnd: 0.6 };
    expect(partGrowth(window, 0.1)).toBe(0);
    expect(partGrowth(window, 0.6)).toBeCloseTo(1);
    expect(partGrowth(window, 1)).toBeCloseTo(1);
    expect(Math.max(...[0.45, 0.5, 0.55].map((p) => partGrowth(window, p)))).toBeGreaterThan(1);
  });

  it('rejects parts without a growth window or with a missing parent', () => {
    const missingWindow = scene();
    const bare = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    bare.name = 'twistroot_extra';
    missingWindow.getObjectByName('twistroot')!.add(bare);
    expect(() => readPlantModels(missingWindow)).toThrow(/growth window/);
    const orphan = scene();
    orphan.getObjectByName('twistroot')!.add(part('twistroot_crown', 'plants.twistroot.leaf.1', undefined, { attach: 'nope' }));
    expect(() => readPlantModels(orphan)).toThrow(/rides missing part/);
  });

  it('keeps attached parts on their parent tip while both grow, and warms fruit when ripe', () => {
    const library = createMaterialLibrary();
    const models = readPlantModels(scene());
    const rig = createAuthoredRig('sunny-sprout', models, library);
    const body = rig.root.getObjectByName('plant-body')!;
    const stemMesh = body.getObjectByName('sunny-sprout_stem') as Mesh;
    const fruitMesh = body.getObjectByName('sunny-sprout_fruit') as Mesh;

    for (const progress of [0.1, 0.25, 0.4]) {
      rig.update(plant(progress, 'Growing'), 0, true);
      const stemTipY = 0.1 + 0.9 * stemMesh.morphTargetInfluences![0]!;
      expect(fruitMesh.position.y, `fruit rides the stem tip at ${progress}`).toBeCloseTo(stemTipY, 5);
      expect(fruitMesh.visible).toBe(false);
    }
    rig.update(plant(0.75, 'Mature'), 0, true);
    expect(fruitMesh.visible).toBe(true);
    expect(fruitMesh.scale.x).toBeCloseTo(partGrowth({ growStart: 0.5, growEnd: 1 }, 0.75));
    const hulls = body.children.filter((child) => child.userData.part === 'sunny-sprout_fruit-outline');
    expect(hulls).toHaveLength(1);
    expect(hulls[0]!.position.toArray()).toEqual(fruitMesh.position.toArray());

    const fruitMaterial = fruitMesh.material as MeshStandardMaterial;
    expect(fruitMaterial.color.getHex()).not.toBe(new Color(palette.plants['sunny-sprout'].fruit[1]).getHex());
    rig.update(plant(1, 'Harvestable'), 0, true);
    expect(fruitMaterial.color.getHex()).toBe(new Color(palette.plants['sunny-sprout'].fruit[1]).getHex());
    expect(fruitMesh.scale.x).toBeGreaterThan(1.1);
    const top = new Vector3();
    expect(rig.getTop!(top)).toBe(true);
    expect(top.y).toBeGreaterThan(1);

    rig.dispose();
    models.dispose();
    library.dispose();
  });
});
