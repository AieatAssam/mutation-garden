import { BoxGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, MeshToonMaterial, Vector3 } from 'three';
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
  for (const species of ['sunny-sprout', 'bubble-berry', 'twistroot', 'puffcap'] as SpeciesId[]) {
    const group = new Group();
    group.name = species;
    const fruit = part(`${species}_fruit`, `plants.${species}.fruit.1`, undefined,
      { attach: `${species}_stem`, ripe: true, fly: true });
    fruit.position.set(0, 1, 0);
    group.add(stem(`${species}_stem`, `plants.${species}.stem.1`), fruit);
    if (species === 'puffcap') group.add(part(`${species}_fruit_two`, `plants.${species}.fruit.1`, undefined,
      { attach: `${species}_stem`, ripe: true, fly: true }));
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

  it('uses existing authored plants only for species missing from an older GLB', () => {
    const models = readPlantModels(scene());
    expect(models.parts.size).toBe(8);
    expect(models.parts.get('lantern-pod')?.map(({ name }) => name)).toEqual(models.parts.get('bubble-berry')?.map(({ name }) => name));
    expect(models.parts.get('comet-pear')?.map(({ name }) => name)).toEqual(models.parts.get('sunny-sprout')?.map(({ name }) => name));
    expect(models.parts.get('clockvine')?.map(({ name }) => name)).toEqual(models.parts.get('twistroot')?.map(({ name }) => name));
    expect(models.parts.get('dewbell')?.map(({ name }) => name)).toEqual(models.parts.get('puffcap')?.map(({ name }) => name));
    models.dispose();
  });

  it('keeps attached parts on their parent tip while both grow, and warms fruit when ripe', () => {
    const library = createMaterialLibrary();
    const models = readPlantModels(scene());
    const rig = createAuthoredRig('sunny-sprout', models, library);
    const body = rig.root.getObjectByName('plant-body')!;
    const stemMesh = body.getObjectByName('sunny-sprout_stem') as Mesh;
    const stemHull = body.children.find((child) => child.userData.part === 'sunny-sprout_stem-outline') as Mesh;
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
    const regularFruit = fruitMesh.scale.x;
    rig.update({ ...plant(1, 'Harvestable'), size: 'big' }, 0, true);
    expect(fruitMesh.scale.x / regularFruit, 'big fruit is visibly bigger').toBeCloseTo(1.2);
    expect(stemMesh.scale.x, 'the stem keeps its size').toBe(1);
    const fruitHull = hulls[0]!;
    rig.update({ ...plant(1, 'Harvestable'), mutations: ['golden'] }, 0, true);
    expect(fruitHull.visible, 'real-material fruit loses the ink outline').toBe(false);
    expect(stemHull.visible, 'the printed stem outline stays visible').toBe(true);
    rig.update(plant(1, 'Harvestable'), 0, true);
    expect(fruitHull.visible, 'ordinary fruit keeps its ink outline').toBe(true);
    const top = new Vector3();
    expect(rig.getTop!(top)).toBe(true);
    expect(top.y).toBeGreaterThan(1);

    rig.dispose();
    models.dispose();
    library.dispose();
  });

  it('renders all ten trait pairs distinctly and caps Crystal transmission at three on-screen plants', () => {
    const library = createMaterialLibrary(); const models = readPlantModels(scene());
    const rig = createAuthoredRig('sunny-sprout', models, library);
    const fruit = rig.root.getObjectByName('sunny-sprout_fruit') as Mesh;
    const traits = ['crystal', 'giant', 'glowing', 'golden', 'rainbow'] as const;
    const materials = new Map<string, MeshStandardMaterial | MeshPhysicalMaterial | MeshToonMaterial>();
    for (let first = 0; first < traits.length; first += 1) for (let second = first + 1; second < traits.length; second += 1) {
      rig.update({ ...plant(1, 'Harvestable'), mutations: [traits[first]!, traits[second]!] }, 0, true);
      materials.set(`${traits[first]}+${traits[second]}`, fruit.material as MeshStandardMaterial | MeshPhysicalMaterial | MeshToonMaterial);
    }
    expect(materials.size).toBe(10);
    expect(new Set([...materials.values()].map((material) => material.uuid)).size).toBe(10);
    expect(materials.get('crystal+giant')).toBeInstanceOf(MeshPhysicalMaterial);
    expect((materials.get('crystal+giant') as MeshPhysicalMaterial).transmission).toBe(0.92);
    expect(materials.get('crystal+rainbow')).toBeInstanceOf(MeshPhysicalMaterial);
    expect((materials.get('crystal+rainbow') as MeshPhysicalMaterial).iridescence).toBe(0.5);
    expect((materials.get('giant+glowing') as MeshStandardMaterial).emissive.getHex()).toBe(new Color(palette.mutations.glowing.emissive).getHex());
    expect((materials.get('glowing+golden') as MeshStandardMaterial).metalness).toBe(0.82);
    expect((materials.get('glowing+golden') as MeshStandardMaterial).color.getHex()).toBe(new Color(palette.ui.coin.face).getHex());

    rig.update({ ...plant(1, 'Harvestable'), mutations: ['crystal'] }, 0, true, 1);
    expect(fruit.material).toBeInstanceOf(MeshPhysicalMaterial);
    expect((fruit.material as MeshPhysicalMaterial).transmission).toBeLessThanOrEqual(0.92);
    expect((fruit.material as MeshPhysicalMaterial).thickness).toBeLessThanOrEqual(0.6);
    rig.update({ ...plant(1, 'Harvestable'), mutations: ['crystal'] }, 0, true, 0);
    expect((fruit.material as MeshStandardMaterial).opacity).toBe(0.72);
    rig.update({ ...plant(1, 'Harvestable'), mutations: ['rainbow'] }, 0, true);
    expect((fruit.material as MeshPhysicalMaterial).customProgramCacheKey()).toBe('rainbow-bands-v1');
    const rainbowShader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>', fragmentShader: '#include <color_fragment>' };
    (fruit.material as MeshPhysicalMaterial).onBeforeCompile(rainbowShader as never, {} as never);
    expect(rainbowShader.vertexShader).toContain('normalize(objectNormal).y');
    expect(rainbowShader.fragmentShader).toContain('rainbowTime * 6.0');
    expect(rainbowShader.fragmentShader).toContain('rainbowBands[int(band)], 0.9');
    const pairShader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
    (materials.get('crystal+rainbow')!).onBeforeCompile(pairShader as never, {} as never);
    expect(pairShader.fragmentShader).toContain('rainbowTime');
    expect(pairShader.fragmentShader).toContain('pairAccent');

    const puffcap = createAuthoredRig('puffcap', models, library);
    const used = puffcap.update({ ...plant(1, 'Harvestable'), speciesId: 'puffcap', mutations: ['crystal'] }, 0, true, 1);
    expect(used).toBe(1);
    const puffcapFruit = puffcap.root.getObjectByName('plant-body')!.children.filter((child) => child.userData.part === 'puffcap_fruit' || child.userData.part === 'puffcap_fruit_two') as Mesh[];
    expect(puffcapFruit.filter((mesh) => mesh.material instanceof MeshPhysicalMaterial)).toHaveLength(1);
    expect(puffcapFruit.filter((mesh) => mesh.material instanceof MeshStandardMaterial && !(mesh.material instanceof MeshPhysicalMaterial))).toHaveLength(1);
    puffcap.update({ ...plant(1, 'Harvestable'), speciesId: 'puffcap', mutations: ['crystal', 'giant'] }, 0, true, 0);
    expect(puffcapFruit.every((mesh) => mesh.material instanceof MeshStandardMaterial && !(mesh.material instanceof MeshPhysicalMaterial))).toBe(true);
    expect((puffcapFruit[0]!.material as MeshStandardMaterial).customProgramCacheKey()).toContain('-fresnel');
    puffcap.dispose();
    rig.dispose(); models.dispose(); library.dispose();
  });
});
