import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Material, Mesh, MeshBasicMaterial, type BufferGeometry } from 'three';
import type { PlotAnchor } from './garden';
import { createGardenEffects, GARDEN_EFFECT_CAPACITY } from './effects';
import { palette } from './palette';

const effects: ReturnType<typeof createGardenEffects>[] = [];
afterEach(() => effects.splice(0).forEach((pool) => pool.dispose()));

const setup = () => {
  const plot = new Group() as PlotAnchor;
  Object.defineProperty(plot, 'plotId', { value: 'plot-0' });
  const pool = createGardenEffects([plot]);
  effects.push(pool);
  return { plot, pool };
};

const planted = { type: 'Planted', plotId: 'plot-0', speciesId: 'sunny-sprout' } as const;
const stageReached = { type: 'StageReached', plotId: 'plot-0', stage: 'Sprout' } as const;
const laterStages = [
  { type: 'StageReached', plotId: 'plot-0', stage: 'Growing' },
  { type: 'StageReached', plotId: 'plot-0', stage: 'Mature' },
] as const;
const harvestable = { type: 'Harvestable', plotId: 'plot-0' } as const;

const slotRoots = (plot: Group): Group[] => plot.children.filter((child): child is Group =>
  child instanceof Group && child.name.startsWith('garden-effect-'));
const visibleParts = (root: Group) => {
  const visible: Mesh[] = [];
  root.traverse((node) => { if (node instanceof Mesh && node.visible) visible.push(node); });
  return visible;
};
const materialColor = (parts: Mesh[]) => {
  const material = parts[0]!.material;
  expect(material).toBeInstanceOf(MeshBasicMaterial);
  return (material as MeshBasicMaterial).color.getHexString();
};
const paletteHex = (value: string) => value.slice(1).toLowerCase();

describe('garden presentation effects', () => {
  it('spawns pooled soil puffs only from planting and growth simulation events', () => {
    const { plot, pool } = setup();

    pool.trigger([planted], 100, false);
    expect(pool.activeCount).toBe(1);
    const plantedDust = visibleParts(slotRoots(plot)[0]!);
    expect(plantedDust).toHaveLength(7);
    expect(plantedDust.every((mesh) => mesh.name.startsWith('planting-dust-'))).toBe(true);
    plantedDust.forEach((mesh) => mesh.scale.toArray().forEach((axis) => expect(axis).toBeCloseTo(0.17)));
    expect(materialColor(plantedDust)).toBe(paletteHex(palette.environment.soil[2]));
    const plantingScale = plantedDust[0]!.scale.x;

    pool.trigger([stageReached, ...laterStages, harvestable], 101, false);
    expect(pool.activeCount).toBe(5);
    const growthPuffs = slotRoots(plot).slice(1).map(visibleParts);
    expect(growthPuffs).toHaveLength(4);
    growthPuffs.forEach((parts) => {
      expect(parts).toHaveLength(10);
      expect(parts.every((mesh) => mesh.name.startsWith('planting-dust-'))).toBe(true);
      parts.forEach((mesh) => mesh.scale.toArray().forEach((axis) => expect(axis).toBeCloseTo(0.28)));
      expect(parts[0]!.scale.x).toBeGreaterThan(plantingScale);
      expect(materialColor(parts)).toBe(paletteHex(palette.environment.soil[2]));
    });
    pool.update(261, false);
    expect(growthPuffs[0]![0]!.position.y).toBeGreaterThan(plantedDust[0]!.position.y);

    pool.trigger([
      { type: 'Harvested', plotId: 'plot-0', speciesId: 'sunny-sprout', coins: 1 },
      { type: 'CommandRejected', command: 'Plant', plotId: 'plot-0', reason: 'occupied' },
      planted,
      { ...planted, plotId: 'unknown-plot' },
    ], 102, false);
    expect(pool.activeCount).toBe(6);
    expect(slotRoots(plot)).toHaveLength(6);
    pool.dispose();
  });

  it('caps active effects at the fixed pool capacity and reuses slots', () => {
    const { plot, pool } = setup();
    pool.trigger(Array.from({ length: GARDEN_EFFECT_CAPACITY + 9 }, () => stageReached), 0, false);

    expect(pool.activeCount).toBe(GARDEN_EFFECT_CAPACITY);
    expect(slotRoots(plot)).toHaveLength(GARDEN_EFFECT_CAPACITY);
    expect(slotRoots(plot).flatMap(visibleParts)).toHaveLength(GARDEN_EFFECT_CAPACITY * 10);
    pool.update(320, false);
    expect(pool.activeCount).toBe(0);
    expect(slotRoots(plot)).toHaveLength(0);
    pool.dispose();
  });

  it('disposes shared geometry and materials once and detaches every pooled slot', () => {
    const { plot, pool } = setup();
    pool.trigger([planted, stageReached, harvestable], 0, false);
    const roots = slotRoots(plot);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    roots.forEach((root) => root.traverse((node) => {
      if (node instanceof Mesh) {
        geometries.add(node.geometry);
        (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => materials.add(material));
      }
    }));
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    pool.dispose();
    pool.dispose();

    expect(plot.children).toHaveLength(0);
    expect(pool.activeCount).toBe(0);
    geometryDisposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    pool.trigger([planted], 1, false);
    pool.update(1_000, false);
    expect(pool.activeCount).toBe(0);
  });

  it('shortens effects for reduced motion while retaining their event signal', () => {
    const normal = setup();
    const reduced = setup();
    normal.pool.trigger([planted], 0, false);
    reduced.pool.trigger([stageReached], 0, true);
    expect(normal.pool.activeCount).toBe(1);
    expect(reduced.pool.activeCount).toBe(1);
    const normalDust = visibleParts(slotRoots(normal.plot)[0]!);
    const reducedDust = visibleParts(slotRoots(reduced.plot)[0]!);
    const normalStartPosition = normalDust[0]!.position.clone();
    const reducedStartPosition = reducedDust[0]!.position.clone();
    const normalStartScale = normalDust[0]!.scale.x;
    const reducedStartScale = reducedDust[0]!.scale.x;

    normal.pool.update(60, false);
    reduced.pool.update(60, true);
    expect((normalDust[0]!.material as Material).opacity).toBeLessThan(1);
    expect((reducedDust[0]!.material as Material).opacity).toBeLessThan(1);
    expect(normalDust[0]!.position.equals(normalStartPosition)).toBe(false);
    expect(reducedDust[0]!.position.equals(reducedStartPosition)).toBe(true);
    expect(normalDust[0]!.scale.x).toBe(normalStartScale);
    expect(reducedDust[0]!.scale.x).toBe(reducedStartScale);
    normal.pool.update(121, false);
    reduced.pool.update(121, true);
    expect(normal.pool.activeCount).toBe(1);
    expect(reduced.pool.activeCount).toBe(0);
    expect(visibleParts(slotRoots(normal.plot)[0]!)).toHaveLength(7);
  });

  it('switches active dust to a fixed-position 120ms fade when reduced motion turns on', () => {
    const { plot, pool } = setup();
    pool.trigger([planted], 0, false);
    const particle = visibleParts(slotRoots(plot)[0]!)[0]!;
    const start = particle.position.clone();

    pool.update(60, true);
    expect(particle.position.equals(start)).toBe(true);
    expect((particle.material as MeshBasicMaterial).opacity).toBe(1);
    pool.update(120, true);
    expect((particle.material as MeshBasicMaterial).opacity).toBeCloseTo(0.5);
    expect(pool.activeCount).toBe(1);
    pool.update(180, true);
    expect(pool.activeCount).toBe(0);
  });
});
