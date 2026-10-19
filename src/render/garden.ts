import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshToonMaterial,
  Object3D,
  Path,
  Shape,
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

export const GROUND_SURFACE = Object.freeze({ radiusX: 3.45, radiusZ: 3.45, y: 0.48 });

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

function bakeEdgeAo(geometry: BufferGeometry, light: string, shade: string,
  edgeWeight: (x: number, y: number, z: number) => number): BufferGeometry {
  const position = geometry.getAttribute('position');
  const lightColor = new Color(light);
  const shadeColor = new Color(shade);
  const colors: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    const weight = Math.max(0, Math.min(1,
      edgeWeight(position.getX(index), position.getY(index), position.getZ(index))));
    colors.push(
      1 + (shadeColor.r / lightColor.r - 1) * weight,
      1 + (shadeColor.g / lightColor.g - 1) * weight,
      1 + (shadeColor.b / lightColor.b - 1) * weight,
    );
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function roundedRect(path: Path, width: number, height: number, radius: number, clockwise: boolean): Path {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  if (clockwise) {
    path.moveTo(-halfWidth + radius, -halfHeight);
    path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth, -halfHeight + radius);
    path.lineTo(-halfWidth, halfHeight - radius);
    path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth + radius, halfHeight);
    path.lineTo(halfWidth - radius, halfHeight);
    path.quadraticCurveTo(halfWidth, halfHeight, halfWidth, halfHeight - radius);
    path.lineTo(halfWidth, -halfHeight + radius);
    path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth - radius, -halfHeight);
    path.lineTo(-halfWidth + radius, -halfHeight);
  } else {
    path.moveTo(-halfWidth + radius, -halfHeight);
    path.lineTo(halfWidth - radius, -halfHeight);
    path.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
    path.lineTo(halfWidth, halfHeight - radius);
    path.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
    path.lineTo(-halfWidth + radius, halfHeight);
    path.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
    path.lineTo(-halfWidth, -halfHeight + radius);
    path.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  }
  return path;
}

function bedGeometry(owned: Set<BufferGeometry>): BufferGeometry {
  const bedDepth = 0.22;
  const shape = roundedRect(new Shape(), 1.75, 1.75, 0.22, false) as Shape;
  shape.holes.push(roundedRect(new Path(), 1.45, 1.45, 0.18, true));
  const geometry = own(new ExtrudeGeometry(shape, {
    depth: bedDepth,
    bevelEnabled: false,
    curveSegments: 4,
  }), owned);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -bedDepth / 2, 0);
  geometry.computeVertexNormals();
  return bakeEdgeAo(geometry, palette.environment.soil[0]!, palette.environment.soil[1]!,
    (x, _y, z) => Math.max(Math.abs(x), Math.abs(z)) / 0.875 > 0.56
      ? (Math.max(Math.abs(x), Math.abs(z)) / 0.875 - 0.56) / 0.44
      : 0);
}

export function createGarden(materials: MaterialLibrary): Garden {
  const root = new Group() as Garden;
  root.name = 'garden';
  const owned = new Set<BufferGeometry>();
  const ownedMaterials = new Set<MeshToonMaterial>();
  const sky = createDaySky();
  const plots: PlotAnchor[] = [];
  const addShape = (geometry: BufferGeometry, color: string, x: number, y: number, z: number,
    thickness = 0, scaleX = 1, material?: MeshToonMaterial): Mesh => {
    const mesh = new Mesh(geometry, material ?? materials.toon(color));
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
  const vertexColorMaterial = (color: string): MeshToonMaterial => {
    const source = materials.toon(color);
    const material = source.clone();
    material.onBeforeCompile = source.onBeforeCompile;
    material.customProgramCacheKey = source.customProgramCacheKey;
    material.vertexColors = true;
    material.needsUpdate = true;
    ownedMaterials.add(material);
    return material;
  };

  root.add(sky.mesh);
  const rockTop = 3.35;
  const rockBottom = 1.65;
  const rockHeight = 2.1;
  const rockY = -0.98;
  const rockOutlineGeometry = own(new CylinderGeometry(rockTop, rockBottom, rockHeight, 12, 1), owned);
  const rockOutline = materials.outline(rockOutlineGeometry, ROCK_OUTLINE_THICKNESS);
  rockOutline.position.y = rockY;
  rockOutline.renderOrder = 0;
  root.add(rockOutline);
  for (let band = 0; band < 5; band += 1) {
    const upper = rockTop - (rockTop - rockBottom) * band / 5;
    const lower = rockTop - (rockTop - rockBottom) * (band + 1) / 5;
    const geometry = flat(new CylinderGeometry(upper, lower, rockHeight / 5, 12, 1), owned);
    const mesh = new Mesh(geometry, materials.toon(palette.environment['island-rock'][band]!));
    mesh.position.y = rockY + rockHeight / 2 - rockHeight * (band + 0.5) / 5;
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  const grassGeometry = bakeEdgeAo(
    own(new CylinderGeometry(3.48, 3.58, 0.34, 48, 1), owned),
    palette.environment.grass[2]!, palette.environment.grass[3]!,
    (_x, y) => Math.max(0, Math.min(1, (-y - 0.11) / 0.06)),
  );
  const grassMaterial = vertexColorMaterial(palette.environment.grass[2]!);
  const grass = addShape(grassGeometry, palette.environment.grass[2]!, 0, 0.24, 0,
    DEFAULT_OUTLINE_THICKNESS, 1, grassMaterial);
  grass.userData.aoBaked = true;
  const lip = new Mesh(own(new CylinderGeometry(3.45, 3.48, 0.08, 48, 1), owned),
    materials.toon(palette.environment.grass[0]!));
  lip.position.y = GROUND_SURFACE.y - 0.04;
  lip.renderOrder = 2;
  root.add(lip);

  const furrowGeometry = own(new CapsuleGeometry(0.07, 1.28, 2, 6), owned);
  furrowGeometry.rotateZ(Math.PI / 2);
  const furrows = new InstancedMesh(furrowGeometry, materials.toon(palette.environment.soil[0]!), 18);
  furrows.name = 'plot-furrows';
  furrows.userData.role = 'plot-furrows';
  furrows.userData.furrowsPerPlot = 3;
  const instance = new Object3D();
  let furrowIndex = 0;
  const xs = [-1.05, 1.05];
  const zs = [2, 0, -2];
  const bedCenterY = 0.59;
  const soilTop = 0.65;
  const bedShape = bedGeometry(owned);
  const bedMaterial = vertexColorMaterial(palette.environment.soil[0]!);
  const soilShape = rounded(owned, 1.39, 0.10, 1.39);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const id = `plot-${row * 2 + column}` as PlotId;
      const x = xs[column]!;
      const z = zs[row]!;
      const bed = addShape(bedShape, palette.environment.soil[0]!, x, bedCenterY, z,
        DEFAULT_OUTLINE_THICKNESS, 1, bedMaterial);
      bed.name = 'plot-bed';
      bed.userData.role = 'plot-bed';
      bed.userData.plotId = id;
      bed.userData.aoBaked = true;
      const soil = new Mesh(soilShape, materials.toon(palette.environment.soil[1]!));
      soil.name = 'plot-soil';
      soil.userData.role = 'plot-soil';
      soil.userData.plotId = id;
      soil.position.set(x, soilTop - 0.05, z);
      soil.renderOrder = 2;
      root.add(soil);
      for (let furrow = -1; furrow <= 1; furrow += 1) {
        instance.position.set(x, soilTop + 0.01, z + furrow * 0.45);
        instance.rotation.set(0, 0, 0);
        instance.scale.set(1, 1, 1);
        instance.updateMatrix();
        furrows.setMatrixAt(furrowIndex, instance.matrix);
        furrowIndex += 1;
      }
      const anchor = new Group() as PlotAnchor;
      Object.defineProperty(anchor, 'plotId', { value: id, enumerable: true });
      anchor.name = id;
      anchor.position.set(x, soilTop, z);
      anchor.userData.plotId = id;
      plots.push(anchor);
      root.add(anchor);
    }
  }
  furrows.instanceMatrix.needsUpdate = true;
  root.add(furrows);

  const shadow = materials.blob();
  shadow.name = 'prop-shadow';
  shadow.userData.role = 'prop-shadow';
  shadow.position.set(2.75, 0.485, 0.75);
  shadow.scale.set(0.95, 0.64, 1);
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);
  const prop = addShape(rounded(owned, 0.58, 0.66, 0.62), palette.environment['wood-crate'][1]!,
    2.75, 0.82, 0.75, DEFAULT_OUTLINE_THICKNESS);
  prop.name = 'garden-prop';
  prop.userData.role = 'garden-prop';

  Object.defineProperty(root, 'plots', { value: plots, enumerable: true });
  let disposed = false;
  root.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of owned) geometry.dispose();
    owned.clear();
    furrows.dispose();
    for (const material of ownedMaterials) material.dispose();
    ownedMaterials.clear();
    sky.dispose();
  };
  return root;
}
