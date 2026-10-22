import { Group, Mesh, Vector3 } from 'three';
import type { SpeciesId } from '../sim';
import type { MaterialLibrary } from './materials';
import { palette } from './palette';
import { SPECIES_SCALE, type PlantModels } from './plants/authored';

/** Top of the harvest crate in tools/blender/build_garden.py (Blender x 2.75, y -0.75). */
export const CRATE_TOP = new Vector3(2.75, 1.05, 0.75);
const STRETCH_MS = 70;
const FLIGHT_MS = 450;
const LAND_MS = 160;
const MAX_FLIGHTS = 8;

interface Flight {
  readonly group: Group;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly startMs: number;
  readonly scale: number;
}

export interface HarvestFlights {
  readonly root: Group;
  /** Launches the species' fruit from a plant's fruit centre to the crate (motion.md 4.4). */
  launch(species: SpeciesId, from: Vector3, nowMs: number, reducedMotion: boolean): void;
  update(nowMs: number): void;
  readonly activeCount: number;
  dispose(): void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function createHarvestFlights(models: () => PlantModels | null, materials: MaterialLibrary): HarvestFlights {
  const root = new Group();
  root.name = 'harvest-flights';
  const flights: Flight[] = [];
  const point = new Vector3();

  function finish(flight: Flight): void {
    flight.group.removeFromParent();
  }

  return {
    root,
    launch(species, from, nowMs, reducedMotion) {
      const current = models();
      if (!current || reducedMotion) return;
      if (flights.length >= MAX_FLIGHTS) finish(flights.shift()!);
      const group = new Group();
      const fruitColor = palette.plants[species].fruit[1];
      for (const part of current.parts.get(species) ?? []) {
        if (part.channel !== 'fruit' && part.channel !== 'cap') continue;
        const mesh = new Mesh(part.geometry, materials.toon(part.channel === 'fruit' ? fruitColor : part.color));
        mesh.morphTargetInfluences![0] = 1;
        // Centre the fruit on the group so it can spin and squash about itself.
        const fruit = current.parts.get(species)!.find((candidate) => candidate.channel === 'fruit')!;
        mesh.position.copy(fruit.grownCenter).multiplyScalar(-1);
        mesh.renderOrder = 3;
        const hull = materials.outline(part.geometry);
        hull.morphTargetInfluences![0] = 1;
        hull.position.copy(mesh.position);
        group.add(mesh, hull);
      }
      root.add(group);
      flights.push({ group, from: from.clone(), to: CRATE_TOP.clone(), startMs: nowMs, scale: SPECIES_SCALE[species] * 1.14 });
    },
    update(nowMs) {
      for (let index = flights.length - 1; index >= 0; index -= 1) {
        const flight = flights[index]!;
        const age = nowMs - flight.startMs;
        const { group, from, to, scale } = flight;
        if (age < STRETCH_MS) {
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
    },
  };
}
