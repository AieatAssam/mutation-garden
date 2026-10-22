import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { GardenSnapshot, PlotId } from '../sim';
import type { PlotAnchor } from './garden';
import { palette } from './palette';

/** A just-harvested plot pulses this long, inviting a one-tap replant (design.md 4.1). */
export const REPLANT_PULSE_MS = 3000;
/** While learning (below this XP) the next empty plot pulses (design.md 3, 0 s and ~3 s). */
const LEARNING_XP = 25;
const PERIOD_MS = 1200;

/** Which plot pulses: a fresh replant first, else the first empty plot while the player is learning. */
export function pulsePlot(snapshot: GardenSnapshot, harvestedAt: ReadonlyMap<PlotId, number>, nowMs: number): PlotId | null {
  for (const plot of snapshot.plots) {
    const at = harvestedAt.get(plot.id);
    if (!plot.plant && at !== undefined && nowMs - at < REPLANT_PULSE_MS) return plot.id;
  }
  if (snapshot.xp >= LEARNING_XP) return null;
  return snapshot.plots.find(({ plant }) => !plant)?.id ?? null;
}

export interface PlotPulse {
  readonly mesh: Mesh;
  harvested(plotId: PlotId, nowMs: number): void;
  update(snapshot: GardenSnapshot | null, anchors: ReadonlyMap<PlotId, PlotAnchor>, nowMs: number, reducedMotion: boolean): void;
  dispose(): void;
}

/** A soft paper ring on the soil of the plot to tap next. One draw call; never pickable. */
export function createPlotPulse(): PlotPulse {
  const geometry = new RingGeometry(0.5, 0.62, 40);
  const material = new MeshBasicMaterial({ color: palette.ink['paper-white'], transparent: true, depthWrite: false,
    side: DoubleSide, toneMapped: false });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'plot-pulse';
  mesh.rotation.x = -Math.PI / 2;
  // Just above the furrow ridges (soil top 0.63 + ridge radius 0.11; the anchor sits at 0.65).
  mesh.position.y = 0.11;
  mesh.renderOrder = 2;
  mesh.visible = false;
  mesh.raycast = () => {};
  const harvestedAt = new Map<PlotId, number>();

  return {
    mesh,
    harvested(plotId, nowMs) {
      harvestedAt.set(plotId, nowMs);
    },
    update(snapshot, anchors, nowMs, reducedMotion) {
      const target = snapshot ? pulsePlot(snapshot, harvestedAt, nowMs) : null;
      const anchor = target ? anchors.get(target) : undefined;
      mesh.visible = Boolean(anchor);
      if (!anchor) return;
      if (mesh.parent !== anchor) anchor.add(mesh);
      const wave = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin((nowMs / PERIOD_MS) * Math.PI * 2);
      mesh.scale.setScalar(0.92 + 0.12 * wave);
      material.opacity = 0.35 + 0.4 * wave;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
