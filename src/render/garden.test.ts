import { describe, expect, it } from 'vitest';
import { createGarden } from './garden';
import { buildScenery } from './scenery';
import { createMaterialLibrary } from './materials';
import { Group } from 'three';

describe('createGarden', () => {
  it('exposes six starter anchors and two hidden west expansion anchors', () => {
    const garden = createGarden();
    expect(garden.plots.map(({ plotId }) => plotId)).toEqual([
      'plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5', 'plot-6', 'plot-7',
    ]);
    expect(garden.plots.map(({ position }) => position.toArray())).toEqual([
      [-1.05, 0.65, 2], [1.05, 0.65, 2],
      [-1.05, 0.65, 0], [1.05, 0.65, 0],
      [-1.05, 0.65, -2], [1.05, 0.65, -2], [-5.25, 0.65, 0], [-7.35, 0.65, 0],
    ]);
    expect(garden.plots.slice(6).every(({ visible }) => !visible)).toBe(true);
    garden.dispose();
  });

  it('replaces scenery and disposes it once', () => {
    const library = createMaterialLibrary();
    const garden = createGarden();
    const first = buildScenery(new Group(), library);
    const second = buildScenery(new Group(), library);
    let firstDisposed = 0;
    const disposeFirst = first.dispose;
    first.dispose = () => { firstDisposed += 1; disposeFirst(); };
    garden.setScenery(first);
    garden.setScenery(second);
    expect(first.parent).toBeNull();
    expect(second.parent).toBe(garden);
    garden.dispose();
    garden.dispose();
    expect(firstDisposed).toBe(1);
    library.dispose();
  });
});
