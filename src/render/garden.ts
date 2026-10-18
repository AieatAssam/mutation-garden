import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PlotId } from '../sim';
import type { MaterialLibrary } from './materials';
import { DEFAULT_OUTLINE_THICKNESS, ROCK_OUTLINE_THICKNESS } from './materials';
import { palette } from './palette';
import { createDaySky } from './sky';

export interface PlotAnchor extends Group {
  readonly plotId: PlotId;
}

export interface Garden extends Group {
  readonly plots: readonly PlotAnchor[];
  dispose(): void;
}

function own<T extends BufferGeometry>(geometry: T, owned: Set<BufferGeometry>): T {
  owned.add(geometry);
  return geometry;
}

function rounded(owned: Set<BufferGeometry>, width: number, height: number, depth: number): RoundedBoxGeometry {
  return own(new RoundedBoxGeometry(width, height, depth, 4, Math.min(height / 2, 0.22)), owned);
}

function flat(geometry: CylinderGeometry, owned: Set<BufferGeometry>): BufferGeometry {
  own(geometry, owned);
  const faces = own(geometry.toNonIndexed(), owned);
  faces.computeVertexNormals();
  return faces;
}

export function createGarden(materials: MaterialLibrary): Garden {
  const root = new Group() as Garden;
  root.name = 'garden';
  const owned = new Set<BufferGeometry>();
  const sky = createDaySky();
  const plots: PlotAnchor[] = [];
  const addShape = (geometry: BufferGeometry, color: string, x: number, y: number, z: number,
    thickness = 0, scaleX = 1): Mesh => {
    const mesh = new Mesh(geometry, materials.toon(color));
    mesh.position.set(x, y, z);
    mesh.scale.x = scaleX;
    root.add(mesh);
    if (thickness > 0) {
      const hull = materials.outline(geometry, thickness);
      hull.position.copy(mesh.position);
      hull.rotation.copy(mesh.rotation);
      hull.scale.copy(mesh.scale);
      hull.renderOrder = 0;
      mesh.renderOrder = 1;
      root.add(hull);
    }
    return mesh;
  };

  root.add(sky.mesh);
  const rockTop = 3.62;
  const rockBottom = 2.62;
  const rockHeight = 1.06;
  const rockY = -0.46;
  const rockOutlineGeometry = own(new CylinderGeometry(rockTop, rockBottom, rockHeight, 12, 1), owned);
  const rockOutline = materials.outline(rockOutlineGeometry, ROCK_OUTLINE_THICKNESS);
  rockOutline.scale.x = 0.75;
  rockOutline.position.y = rockY;
  rockOutline.renderOrder = 0;
  root.add(rockOutline);
  for (let band = 0; band < 5; band += 1) {
    const upper = rockTop - (rockTop - rockBottom) * band / 5;
    const lower = rockTop - (rockTop - rockBottom) * (band + 1) / 5;
    const geometry = flat(new CylinderGeometry(upper, lower, rockHeight / 5, 12, 1), owned);
    const mesh = new Mesh(geometry, materials.toon(palette.environment['island-rock'][band]!));
    mesh.scale.x = 0.75;
    mesh.position.y = rockY + rockHeight / 2 - rockHeight * (band + 0.5) / 5;
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  const grassGeometry = own(new CylinderGeometry(3.52, 3.65, 0.34, 32, 1), owned);
  addShape(grassGeometry, palette.environment.grass[2]!, 0, 0.24, 0,
    DEFAULT_OUTLINE_THICKNESS, 0.75);
  const lip = new Mesh(own(new CylinderGeometry(3.5, 3.52, 0.08, 32, 1), owned),
    materials.toon(palette.environment.grass[0]!));
  lip.scale.x = 0.75;
  lip.position.y = 0.44;
  lip.renderOrder = 2;
  root.add(lip);

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const id = `plot-${row * 2 + column}` as PlotId;
      const x = column === 0 ? -1 : 1;
      const z = 2 - row * 2;
      addShape(rounded(owned, 1.78, 0.06, 1.42), palette.environment.soil[1]!, x, 0.55, z,
        DEFAULT_OUTLINE_THICKNESS);
      const anchor = new Group() as PlotAnchor;
      Object.defineProperty(anchor, 'plotId', { value: id, enumerable: true });
      anchor.name = id;
      anchor.position.set(x, 0.58, z);
      anchor.userData.plotId = id;
      plots.push(anchor);
      root.add(anchor);
    }
  }

  const shadow = materials.blob();
  shadow.position.set(2.25, 0.485, 0);
  shadow.scale.set(0.72, 0.42, 1);
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);
  addShape(rounded(owned, 0.58, 0.66, 0.62), palette.environment['wood-crate'][1]!,
    2.25, 0.79, 0, DEFAULT_OUTLINE_THICKNESS);

  Object.defineProperty(root, 'plots', { value: plots, enumerable: true });
  let disposed = false;
  root.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of owned) geometry.dispose();
    owned.clear();
    sky.dispose();
  };
  return root;
}
