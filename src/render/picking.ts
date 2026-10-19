import {
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type OrthographicCamera,
} from 'three';
import type { PlotId } from '../sim';
import { GROUND_SURFACE, type Garden } from './garden';
import { palette } from './palette';

export type PickResult = { readonly kind: 'plot'; readonly plotId: PlotId } | { readonly kind: 'ground' } | null;

function isVisibleUnder(object: Object3D, ancestor: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === ancestor) return true;
  }
  return false;
}

function isPlantSurface(object: Object3D): object is Mesh {
  if (!(object instanceof Mesh)) return false;
  const part = object.userData.part;
  return typeof part === 'string'
    && part !== 'blob'
    && !part.endsWith('halo')
    && !part.endsWith('outline');
}

export function createGardenPicker(
  canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'>,
  camera: OrthographicCamera,
  garden: Garden,
): { pick(clientX: number, clientY: number): PickResult; dispose(): void } {
  const plotGeometry = new PlaneGeometry(1, 1);
  const groundGeometry = new CircleGeometry(1, 48);
  const material = new MeshBasicMaterial({ color: palette.ink['press-ink'], side: DoubleSide });
  const plotTargets = garden.plots.map(() => new Mesh(plotGeometry, material));
  const groundTarget = new Mesh(groundGeometry, material);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const center = new Vector3();
  const gardenScale = new Vector3();
  const facing = new Quaternion();
  const groundRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  let disposed = false;

  function refreshTargets(width: number, height: number): void {
    camera.updateWorldMatrix(true, false);
    garden.updateWorldMatrix(true, false);
    camera.getWorldQuaternion(facing);
    garden.plots.forEach((anchor, index) => {
      const target = plotTargets[index]!;
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(target.position);
      target.quaternion.copy(facing);
      target.scale.set(width, height, 1);
      target.updateMatrixWorld(true);
    });

    garden.localToWorld(center.set(0, GROUND_SURFACE.y, 0));
    garden.getWorldQuaternion(groundTarget.quaternion).multiply(groundRotation);
    garden.getWorldScale(gardenScale);
    groundTarget.position.copy(center);
    groundTarget.scale.set(
      GROUND_SURFACE.radiusX * gardenScale.x,
      GROUND_SURFACE.radiusZ * gardenScale.z,
      1,
    );
    groundTarget.updateMatrixWorld(true);
  }

  return {
    pick(clientX, clientY) {
      if (disposed || !Number.isFinite(clientX) || !Number.isFinite(clientY) || plotTargets.length === 0) return null;
      const rect = canvas.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)
        || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
        || rect.width <= 0 || rect.height <= 0
        || clientX < rect.left || clientY < rect.top
        || clientX >= rect.left + rect.width || clientY >= rect.top + rect.height) return null;

      const viewWidth = camera.right - camera.left;
      const viewHeight = camera.top - camera.bottom;
      if (!Number.isFinite(viewWidth) || viewWidth <= 0 || !Number.isFinite(viewHeight) || viewHeight <= 0
        || !Number.isFinite(camera.zoom) || camera.zoom <= 0) return null;
      const width = 48.25 * viewWidth / (rect.width * camera.zoom);
      const height = 48.25 * viewHeight / (rect.height * camera.zoom);
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

      refreshTargets(width, height);
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(pointer, camera);

      const plantTargets = garden.plots.flatMap((anchor) => anchor.children.map((root) => ({ anchor, root })));
      const plantHits = raycaster.intersectObjects(plantTargets.map(({ root }) => root), true);
      for (const hit of plantHits) {
        const target = plantTargets.find(({ root }) => root.getObjectById(hit.object.id));
        if (target && isPlantSurface(hit.object) && isVisibleUnder(hit.object, target.anchor)) {
          return { kind: 'plot', plotId: target.anchor.plotId };
        }
      }

      const plotHit = raycaster.intersectObjects(plotTargets, false)[0];
      if (plotHit) {
        const index = plotTargets.indexOf(plotHit.object as typeof plotTargets[number]);
        return index < 0 ? null : { kind: 'plot', plotId: garden.plots[index]!.plotId };
      }
      return raycaster.intersectObject(groundTarget, false).length > 0 ? { kind: 'ground' } : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      plotGeometry.dispose();
      groundGeometry.dispose();
      material.dispose();
    },
  };
}
