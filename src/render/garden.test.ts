import { describe, expect, it } from 'vitest';
import { createGarden } from './garden';
import { buildScenery } from './scenery';
import { createMaterialLibrary } from './materials';
import { Group } from 'three';

describe('createGarden', () => {
  it('exposes six stable anchors in the two-column, three-row bed layout', () => {
    const garden = createGarden();
    expect(garden.plots.map(({ plotId }) => plotId)).toEqual([
      'plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5',
    ]);
    expect(garden.plots.map(({ position }) => position.toArray())).toEqual([
      [-1.05, 0.65, 2], [1.05, 0.65, 2],
      [-1.05, 0.65, 0], [1.05, 0.65, 0],
      [-1.05, 0.65, -2], [1.05, 0.65, -2],
    ]);
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
