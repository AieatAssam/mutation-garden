import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { palette } from './palette';

export interface DaySky {
  readonly mesh: Mesh;
  dispose(): void;
}

export function createDaySky(): DaySky {
  const geometry = new PlaneGeometry(100, 20, 1, 32);
  const position = geometry.getAttribute('position');
  const zenith = new Color(palette.environment['sky-day'].zenith);
  const mid = new Color(palette.environment['sky-day'].mid);
  const horizon = new Color(palette.environment['sky-day'].horizon);
  const color = new Color();
  const colors: number[] = [];

  for (let index = 0; index < position.count; index += 1) {
    const amount = Math.max(0, Math.min(1, (position.getY(index) + 10) / 20));
    color.copy(amount > 0.5 ? mid : horizon).lerp(
      amount > 0.5 ? zenith : mid,
      amount > 0.5 ? (amount - 0.5) * 2 : amount * 2,
    );
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new MeshBasicMaterial({
    vertexColors: true,
    side: DoubleSide,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  const tilt = Math.atan2(6, 14);
  mesh.name = 'day-sky-gradient';
  mesh.rotation.x = -tilt;
  mesh.position.set(0, 6 - 50 * Math.sin(tilt), 14 - 50 * Math.cos(tilt));
  mesh.renderOrder = -1;

  let disposed = false;
  return {
    mesh,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
