import { describe, expect, it } from 'vitest';
import { createInitialState, MAX_LAB_SPECIMENS, step } from '../index';
import type { Fruit } from './types';

const fruit: Fruit = { speciesId: 'sunny-sprout', size: 'regular', mutations: ['giant'], value: 4, xp: 2 };

describe('laboratory specimen inventory', () => {
  it('moves the selected fruit atomically into a stable, saved specimen slot', () => {
    const state = { ...createInitialState(7, 0), crate: [fruit] };
    const result = step(state, [{ type: 'StoreLabSpecimen', crateIndex: 0, expectedFruit: fruit }], 100);

    expect(result.events).toContainEqual({ type: 'LabSpecimenStored', specimenId: 0 });
    expect(result.state.crate).toEqual([]);
    expect(result.state.labSpecimens).toEqual([{ id: 0, fruit }]);
    expect(result.state.nextLabSpecimenId).toBe(1);
    expect(state.crate).toEqual([fruit]);
  });

  it('rejects stale tray selections without consuming another fruit', () => {
    const other: Fruit = { ...fruit, speciesId: 'bubble-berry', value: 6 };
    const state = { ...createInitialState(7, 0), crate: [other] };
    const result = step(state, [{ type: 'StoreLabSpecimen', crateIndex: 0, expectedFruit: fruit }], 0);

    expect(result.events).toContainEqual({ type: 'LabSpecimenRejected', reason: 'invalid-selection' });
    expect(result.state.crate).toEqual([other]);
    expect(result.state.labSpecimens).toEqual([]);
  });

  it('caps persisted specimens at the physics pool limit', () => {
    const labSpecimens = Array.from({ length: MAX_LAB_SPECIMENS }, (_, id) => ({ id, fruit }));
    const state = { ...createInitialState(7, 0), crate: [fruit], labSpecimens, nextLabSpecimenId: MAX_LAB_SPECIMENS };
    const result = step(state, [{ type: 'StoreLabSpecimen', crateIndex: 0, expectedFruit: fruit }], 0);

    expect(result.events).toContainEqual({ type: 'LabSpecimenRejected', reason: 'laboratory-full' });
    expect(result.state.crate).toEqual([fruit]);
    expect(result.state.labSpecimens).toHaveLength(MAX_LAB_SPECIMENS);
  });
});
