import { Group } from 'three';
import type { PlotId } from '../sim';
import type { Scenery } from './scenery';

export interface PlotAnchor extends Group {
  readonly plotId: PlotId;
}

export interface Garden extends Group {
  readonly plots: readonly PlotAnchor[];
  /** Adds the authored island model (tools/blender/build_garden.py); replaces any previous one. */
  setScenery(scenery: Scenery): void;
  dispose(): void;
}

/** The grass top of the authored island: y and a conservative inscribed radius. */
export const GROUND_SURFACE = Object.freeze({ radiusX: 3.75, radiusZ: 3.75, y: 0.48 });

/** Plot centres match the beds in tools/blender/build_garden.py. */
const PLOT_XS = [-1.05, 1.05];
const PLOT_ZS = [2, 0, -2];
const SOIL_TOP = 0.65;
/** Outer size of each raised bed, matching BED in tools/blender/build_garden.py. */
export const BED_SIZE = 1.75;

export function createGarden(): Garden {
  const root = new Group() as Garden;
  root.name = 'garden';

  const plots: PlotAnchor[] = [];
  for (let index = 0; index < 8; index += 1) {
      const row = Math.floor(index / 2); const column = index % 2;
      const id = `plot-${index}` as PlotId;
      const anchor = new Group() as PlotAnchor;
      Object.defineProperty(anchor, 'plotId', { value: id, enumerable: true });
      anchor.name = id;
      anchor.position.set(index < 6 ? PLOT_XS[column]! : (index === 6 ? -5.25 : -7.35), SOIL_TOP,
        index < 6 ? PLOT_ZS[row]! : 0);
      if (index >= 6) anchor.visible = false;
      if (index >= 6) anchor.userData.locked = true;
      anchor.userData.plotId = id;
      plots.push(anchor);
      root.add(anchor);
  }
  Object.defineProperty(root, 'plots', { value: plots, enumerable: true });

  let scenery: Scenery | null = null;
  let disposed = false;
  root.setScenery = (next) => {
    if (disposed) {
      next.dispose();
      return;
    }
    scenery?.removeFromParent();
    scenery?.dispose();
    scenery = next;
    root.add(next);
  };
  root.dispose = () => {
    if (disposed) return;
    disposed = true;
    scenery?.dispose();
  };
  return root;
}
