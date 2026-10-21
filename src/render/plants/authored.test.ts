import { BoxGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { PlantSnapshot, SpeciesId } from '../../sim';
import { createMaterialLibrary } from '../materials';
import { palette } from '../palette';
import { channelInfluence, createAuthoredRig, readPlantModels } from './authored';

function part(name: string, materialName: string): Mesh {
  const geometry = new BoxGeometry(0.2, 0.2, 0.2);
  const position = geometry.getAttribute('position');
  geometry.morphAttributes.position = [new Float32BufferAttribute(new Float32Array(position.count * 3).fill(0.1), 3)];
  geometry.morphTargetsRelative = true;
  const material = new MeshStandardMaterial();
  material.name = materialName;
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function scene(): Group {
  const root = new Group();
  for (const species of ['sunny-sprout', 'bubble-berry', 'twistroot'] as SpeciesId[]) {
    const group = new Group();
    group.name = species;
    group.add(part(`${species}_stem`, `plants.${species}.stem.1`), part(`${species}_leaf_0`, `plants.${species}.leaf.1`),
      part(`${species}_fruit`, `plants.${species}.fruit.1`));
    root.add(group);
  }
  return root;
}

const plant = (progress: number, stage: PlantSnapshot['stage']): PlantSnapshot =>
  ({ speciesId: 'sunny-sprout', plantedAt: 0, progress, stage });

describe('authored plants', () => {
  it('grows parts in overlapping windows and settles at full size', () => {
    expect(channelInfluence('stem', 0)).toBeCloseTo(0);
    expect(channelInfluence('fruit', 0.3)).toBe(0);
    expect(channelInfluence('stem', 0.3)).toBeGreaterThan(channelInfluence('leaf', 0.3));
    expect(channelInfluence('leaf', 0.3)).toBeGreaterThan(channelInfluence('fruit', 0.3));
    for (const channel of ['stem', 'leaf', 'fruit', 'cap'] as const) expect(channelInfluence(channel, 1)).toBeCloseTo(1);
  });

  it('rejects meshes without a channel or grow morph', () => {
    const bad = scene();
    bad.getObjectByName('twistroot')!.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    expect(() => readPlantModels(bad)).toThrow(/growth channel/);
  });

  it('drives morphs on parts and their hulls and warms the fruit when ripe', () => {
    const library = createMaterialLibrary();
    const models = readPlantModels(scene());
    const rig = createAuthoredRig('sunny-sprout', models, library);
    const meshes = rig.root.getObjectByName('plant-body')!.children as Mesh[];
    expect(meshes.filter((mesh) => mesh.userData.part === 'stem')).toHaveLength(1);
    expect(meshes.filter((mesh) => mesh.userData.part === 'stem-outline')).toHaveLength(1);

    rig.update(plant(0.5, 'Growing'), 0, true);
    for (const mesh of meshes) {
      const channel = String(mesh.userData.part).replace('-outline', '') as 'stem' | 'leaf' | 'fruit';
      expect(mesh.morphTargetInfluences![0]).toBeCloseTo(channelInfluence(channel, 0.5));
    }
    const fruit = meshes.find((mesh) => mesh.userData.part === 'fruit')!;
    const fruitMaterial = fruit.material as MeshStandardMaterial;
    expect(fruitMaterial.color.getHex()).toBe(new Color(palette.plants['sunny-sprout'].fruit[3]).getHex());
    rig.update(plant(1, 'Harvestable'), 0, true);
    expect(fruitMaterial.color.getHex()).toBe(new Color(palette.plants['sunny-sprout'].fruit[1]).getHex());

    rig.dispose();
    models.dispose();
    library.dispose();
  });
});
