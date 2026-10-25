import { Group, Mesh, Vector3, type Material } from 'three';
import type { SpeciesId, YieldSize } from '../sim';
import type { MaterialLibrary } from './materials';
import { palette } from './palette';
import { SPECIES_SCALE, YIELD_SCALE, type PlantModels } from './plants/authored';

/** Top of the harvest crate in tools/blender/build_garden.py (Blender x 2.75, y -0.75). */
export const CRATE_TOP = new Vector3(2.75, 1.05, 0.75);
const STRETCH_MS = 70;
const FLIGHT_MS = 450;
const LAND_MS = 160;
const MAX_FLIGHTS = 8;

interface Flight {
  readonly group: Group;
  readonly species: SpeciesId;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly startMs: number;
  readonly scale: number;
}

export interface HarvestFlights {
  readonly root: Group;
  /** Launches the plant's harvested parts from where they grew on the plot to the crate (motion.md 4.4). */
  launch(species: SpeciesId, plotAnchor: Vector3, size: YieldSize, nowMs: number, reducedMotion: boolean): void;
  sell(species: SpeciesId, from: Vector3, to: Vector3, nowMs: number, reducedMotion: boolean): void;
  update(nowMs: number): void;
  readonly activeCount: number;
  dispose(): void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function makeFruit(species: SpeciesId, current: PlantModels, materials: MaterialLibrary): Group {
  const group = new Group();
  const fruitColor = palette.plants[species].fruit[1];
  const flying = (current.parts.get(species) ?? []).filter((part) => part.fly);
  const centre = new Vector3();
  for (const part of flying) centre.add(part.origin).add(part.grownCenter);
  centre.divideScalar(Math.max(1, flying.length));
  for (const part of flying) {
    const baseMaterial = materials.toon(part.ripe ? fruitColor : part.color);
    const flightMaterial = baseMaterial.clone();
    flightMaterial.onBeforeCompile = baseMaterial.onBeforeCompile;
    flightMaterial.customProgramCacheKey = baseMaterial.customProgramCacheKey;
    const mesh = new Mesh(part.geometry, flightMaterial);
    const hull = materials.outline(part.geometry).clone();
    for (const item of [mesh, hull]) {
      if (part.morph) item.morphTargetInfluences![0] = 1;
      item.position.copy(part.origin).sub(centre);
    }
    mesh.renderOrder = 3;
    group.add(mesh, hull);
  }
  return group;
}

export function createHarvestFlights(models: () => PlantModels | null, materials: MaterialLibrary): HarvestFlights {
  const root = new Group();
  root.name = 'harvest-flights';
  const flights: (Flight & { readonly reducedMotion: boolean })[] = [];
  const pool: Group[] = [];
  const point = new Vector3();

  function finish(flight: Flight): void {
    flight.group.removeFromParent();
    if (pool.length < MAX_FLIGHTS) pool.push(flight.group);
  }

  function acquire(species: SpeciesId, current: PlantModels): Group {
    const index = pool.findIndex((group) => group.userData.species === species);
    const group = index < 0 ? makeFruit(species, current, materials) : pool.splice(index, 1)[0]!;
    group.userData.species = species;
    group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        material.transparent = false;
        material.opacity = 1;
      }
    });
    return group;
  }

  return {
    root,
    launch(species, plotAnchor, size, nowMs, reducedMotion) {
      const current = models();
      if (!current || reducedMotion) return;
      if (flights.length >= MAX_FLIGHTS) finish(flights.shift()!);
      const group = acquire(species, current);
      root.add(group);
      const parts = (current.parts.get(species) ?? []).filter((part) => part.fly);
      const centre = new Vector3();
      for (const part of parts) centre.add(part.origin).add(part.grownCenter);
      centre.divideScalar(Math.max(1, parts.length));
      const scale = SPECIES_SCALE[species] * 1.14 * YIELD_SCALE[size];
      const from = plotAnchor.clone().addScaledVector(centre, scale);
      flights.push({ group, species, from, to: CRATE_TOP.clone(), startMs: nowMs, scale, reducedMotion: false });
    },
    sell(species, from, to, nowMs, reducedMotion) {
      const current = models();
      if (!current) return;
      if (flights.length >= MAX_FLIGHTS) finish(flights.shift()!);
      const group = acquire(species, current);
      root.add(group);
      flights.push({ group, species, from: from.clone(), to: to.clone(), startMs: nowMs, scale: SPECIES_SCALE[species] * 0.7, reducedMotion });
    },
    update(nowMs) {
      for (let index = flights.length - 1; index >= 0; index -= 1) {
        const flight = flights[index]!;
        const age = nowMs - flight.startMs;
        const { group, from, to, scale } = flight;
        if (flight.reducedMotion) {
          const opacity = 1 - Math.min(1, age / 300);
          group.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
              material.transparent = true;
              material.opacity = opacity;
            }
          });
          group.position.lerpVectors(from, to, Math.min(1, age / 300));
          group.scale.setScalar(scale * (1 - Math.min(1, age / 300)));
          if (age >= 300) { finish(flight); flights.splice(index, 1); }
        } else if (age < STRETCH_MS) {
          // Anticipation: the fruit stretches up before it pops off.
          const t = age / STRETCH_MS;
          group.position.copy(from);
          group.scale.set(scale / Math.sqrt(1 + 0.3 * t), scale * (1 + 0.3 * t), scale / Math.sqrt(1 + 0.3 * t));
          group.rotation.set(0, 0, 0);
        } else if (age < STRETCH_MS + FLIGHT_MS) {
          const t = easeInOut((age - STRETCH_MS) / FLIGHT_MS);
          point.lerpVectors(from, to, t);
          point.y += Math.sin(Math.PI * t) * 1.4;
          group.position.copy(point);
          const shrink = 1 - 0.45 * t;
          group.scale.setScalar(scale * shrink);
          group.rotation.set(0, Math.PI * 2 * t, Math.PI * 0.6 * t);
        } else if (age < STRETCH_MS + FLIGHT_MS + LAND_MS) {
          // Squash into the crate and sink out of sight.
          const t = (age - STRETCH_MS - FLIGHT_MS) / LAND_MS;
          const base = scale * 0.55 * (1 - t);
          group.position.set(to.x, to.y - 0.2 * t, to.z);
          group.scale.set(base * 1.25, base * 0.7, base * 1.25);
        } else {
          finish(flight);
          flights.splice(index, 1);
          continue;
        }
        group.updateMatrixWorld(true);
      }
    },
    get activeCount() {
      return flights.length;
    },
    dispose() {
      for (const flight of flights.splice(0)) finish(flight);
      for (const group of pool.splice(0)) {
        group.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          for (const material of (Array.isArray(object.material) ? object.material : [object.material])) (material as Material).dispose();
        });
        group.clear();
      }
    },
  };
}
