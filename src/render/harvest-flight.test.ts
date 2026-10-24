import { BoxGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createHarvestFlights, CRATE_TOP } from './harvest-flight';
import { createMaterialLibrary } from './materials';
import { palette } from './palette';
import type { PartTemplate, PlantModels } from './plants/authored';

const fruit: PartTemplate = {
  name: 'sunny-sprout_fruit', geometry: new BoxGeometry(0.2, 0.2, 0.2), color: palette.plants['sunny-sprout'].fruit[1],
  origin: new Vector3(0, 0.9, 0), growStart: 0.3, growEnd: 1, attach: '', ripe: true, fly: true, morph: false,
  seedTop: new Vector3(0, 0.1, 0), grownTop: new Vector3(0, 0.1, 0), grownCenter: new Vector3(),
};
const models: PlantModels = { parts: new Map([['sunny-sprout', [fruit]]]), dispose() {} };

describe('harvest flights', () => {
  it('flies the harvested parts from the plot to the crate and then retires them', () => {
    const library = createMaterialLibrary();
    const flights = createHarvestFlights(() => models, library);
    flights.launch('sunny-sprout', new Vector3(1, 0.65, 2), 'regular', 0, false);
    expect(flights.activeCount).toBe(1);
    const group = flights.root.children[0]!;
    flights.update(30);
    expect(group.position.y).toBeGreaterThan(1.5);
    expect(group.scale.y).toBeGreaterThan(group.scale.x);
    flights.update(70 + 225);
    expect(group.position.y).toBeGreaterThan(CRATE_TOP.y);
    flights.update(70 + 450 + 10);
    expect(group.position.distanceTo(CRATE_TOP)).toBeLessThan(0.05);
    flights.update(1000);
    expect(flights.activeCount).toBe(0);
    expect(flights.root.children).toHaveLength(0);
    library.dispose();
  });

  it('skips the flight under reduced motion', () => {
    const library = createMaterialLibrary();
    const flights = createHarvestFlights(() => models, library);
    flights.launch('sunny-sprout', new Vector3(), 'big', 0, true);
    expect(flights.activeCount).toBe(0);
    library.dispose();
  });

  it('arcs one authored fruit from the crate to the stall and reuses the capped flight pool', () => {
    const library = createMaterialLibrary();
    const flights = createHarvestFlights(() => models, library);
    const counter = new Vector3(-2.55, 0.92, -1.06);
    flights.sell('sunny-sprout', CRATE_TOP, counter, 0, false);
    const fruitGroup = flights.root.children[0]!;
    flights.update(300);
    expect(fruitGroup.position.y).toBeGreaterThan(Math.max(CRATE_TOP.y, counter.y));
    flights.update(700);
    expect(flights.activeCount).toBe(0);
    expect(flights.root.children).toHaveLength(0);
    flights.sell('sunny-sprout', CRATE_TOP, counter, 710, false);
    expect(flights.root.children[0]).toBe(fruitGroup);
    library.dispose();
  });

  it('uses a short fade flight when reduced motion is enabled', () => {
    const library = createMaterialLibrary();
    const flights = createHarvestFlights(() => models, library);
    flights.sell('sunny-sprout', CRATE_TOP, new Vector3(0, 1, 0), 0, true);
    expect(flights.activeCount).toBe(1);
    flights.update(300);
    expect(flights.activeCount).toBe(0);
    library.dispose();
  });
});
