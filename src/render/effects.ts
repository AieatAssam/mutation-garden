import {
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import type { PlotId, SimEvent } from '../sim';
import type { PlotAnchor } from './garden';
import { palette } from './palette';

export const GARDEN_EFFECT_CAPACITY = 12;
const DUST_LIFETIME_MS = 320;
const REDUCED_LIFETIME_MS = 120;
const DUST_PARTICLE_COUNT = 7;
const GROWTH_DUST_PARTICLE_COUNT = 10;

interface EffectSlot {
  readonly root: Group;
  readonly dust: readonly Mesh[];
  readonly dustMaterial: MeshBasicMaterial;
  active: boolean;
  reducedMotion: boolean;
  growthPuff: boolean;
  particleCount: number;
  startMs: number;
  durationMs: number;
}

export interface GardenEffects {
  trigger(events: readonly SimEvent[], nowMs: number, reducedMotion: boolean): void;
  update(nowMs: number, reducedMotion: boolean): void;
  dispose(): void;
  readonly activeCount: number;
}

/** A fixed-size pool for brief planting and growth accents. */
export function createGardenEffects(plots: readonly PlotAnchor[]): GardenEffects {
  const anchors = new Map<PlotId, PlotAnchor>(plots.map((plot) => [plot.plotId, plot]));
  const dustGeometry = new SphereGeometry(1, 6, 4);
  const slots: EffectSlot[] = [];
  let activeCount = 0;
  let nextSlot = 0;
  let disposed = false;

  for (let index = 0; index < GARDEN_EFFECT_CAPACITY; index += 1) {
    const root = new Group();
    root.name = `garden-effect-${index}`;
    root.visible = false;
    const dustMaterial = new MeshBasicMaterial({
      color: palette.environment.soil[2], transparent: true, depthWrite: false,
    });
    const dust = Array.from({ length: GROWTH_DUST_PARTICLE_COUNT }, (_, particleIndex) => {
      const mesh = new Mesh(dustGeometry, dustMaterial);
      mesh.name = `planting-dust-${particleIndex}`;
      mesh.visible = false;
      mesh.renderOrder = 4;
      mesh.scale.setScalar(0.17);
      root.add(mesh);
      return mesh;
    });
    slots.push({
      root,
      dust,
      dustMaterial,
      active: false,
      reducedMotion: false,
      growthPuff: false,
      particleCount: DUST_PARTICLE_COUNT,
      startMs: 0,
      durationMs: DUST_LIFETIME_MS,
    });
  }

  const deactivate = (slot: EffectSlot) => {
    if (slot.active) activeCount -= 1;
    slot.active = false;
    slot.root.visible = false;
    slot.root.removeFromParent();
  };

  return {
    trigger(events, nowMs, reducedMotion) {
      if (disposed || !Number.isFinite(nowMs)) return;
      for (const event of events) {
        if (event.type !== 'Planted' && event.type !== 'StageReached' && event.type !== 'Harvestable') continue;
        const anchor = anchors.get(event.plotId);
        if (!anchor) continue;
        const slot = slots[nextSlot]!;
        nextSlot = (nextSlot + 1) % slots.length;
        deactivate(slot);
        slot.root.position.set(0, 0, 0);
        slot.growthPuff = event.type !== 'Planted';
        slot.particleCount = slot.growthPuff ? GROWTH_DUST_PARTICLE_COUNT : DUST_PARTICLE_COUNT;
        slot.reducedMotion = reducedMotion;
        slot.startMs = nowMs;
        slot.durationMs = reducedMotion ? REDUCED_LIFETIME_MS : DUST_LIFETIME_MS;
        slot.active = true;
        slot.root.visible = true;
        anchor.add(slot.root);
        slot.dust.forEach((particle, particleIndex) => {
          particle.visible = particleIndex < slot.particleCount;
          particle.position.set(0, 0.15, 0);
          particle.scale.setScalar(slot.growthPuff ? 0.28 : 0.17);
          particle.rotation.set(0, 0, 0);
          particle.userData.particleIndex = particleIndex;
        });
        slot.dustMaterial.color.set(palette.environment.soil[2]);
        slot.dustMaterial.opacity = 1;
        activeCount += 1;
      }
    },
    update(nowMs, reducedMotion) {
      if (disposed || !Number.isFinite(nowMs)) return;
      for (const slot of slots) {
        if (!slot.active) continue;
        if (slot.reducedMotion !== reducedMotion) {
          slot.reducedMotion = reducedMotion;
          slot.startMs = nowMs;
          slot.durationMs = reducedMotion ? REDUCED_LIFETIME_MS : DUST_LIFETIME_MS;
        }
        const progress = Math.max(0, Math.min(1, (nowMs - slot.startMs) / slot.durationMs));
        if (progress >= 1) {
          deactivate(slot);
          continue;
        }
        slot.dust.slice(0, slot.particleCount).forEach((particle, particleIndex) => {
          if (slot.reducedMotion) return;
          const angle = particleIndex * (Math.PI * 2 / slot.particleCount);
          const spreadProgress = 1 - (1 - progress) ** 3;
          const spread = spreadProgress * (slot.growthPuff ? 0.72 : 0.68);
          const lift = progress * (slot.growthPuff ? 0.32 : 0.2);
          particle.position.set(Math.cos(angle) * spread, 0.15 + lift, Math.sin(angle) * spread);
        });
        slot.dustMaterial.opacity = 1 - progress;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) deactivate(slot);
      dustGeometry.dispose();
      for (const slot of slots) {
        slot.dustMaterial.dispose();
      }
    },
    get activeCount() {
      return activeCount;
    },
  };
}
