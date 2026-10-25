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

  it('returns selected specimens without losing fruit and rejects a full crate', () => {
    const specimen = { id: 3, fruit };
    const state = { ...createInitialState(7, 0), labSpecimens: [specimen] };
    const returned = step(state, [{ type: 'ReturnLabSpecimens', specimenIds: [3] }], 0);
    expect(returned.state.crate).toEqual([fruit]);
    expect(returned.state.labSpecimens).toEqual([]);
    expect(returned.events).toContainEqual({ type: 'LabSpecimensReturned', specimens: [3] });

    const full = { ...state, crate: Array.from({ length: 12 }, () => fruit) };
    const rejected = step(full, [{ type: 'ReturnLabSpecimens', specimenIds: [3] }], 0);
    expect(rejected.state).toEqual(full);
    expect(rejected.events).toContainEqual({ type: 'LabReturnRejected', reason: 'crate-full' });

    const invalid = step(state, [{ type: 'ReturnLabSpecimens', specimenIds: [3, 3] }], 0);
    expect(invalid.state.labSpecimens).toEqual(state.labSpecimens);
    expect(invalid.events).toContainEqual({ type: 'LabReturnRejected', reason: 'invalid-selection' });
  });
});

describe('laboratory recipes', () => {
  const frozen = { speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: ['frozen'] as const, value: 10, xp: 10 };
  const electric = { ...frozen, mutations: ['electric'] as const };
  const golden = { ...frozen, mutations: ['golden'] as const };
  const specimenState = { ...createInitialState(9, 0), labSpecimens: [{ id: 4, fruit: frozen }, { id: 8, fruit: electric }] };

  it('always fuses the same trait pair into a Prism Fig seed', () => {
    const first = step(specimenState, [{ type: 'MergeLabSpecimens', specimenIds: [4, 8] }], 1);
    const second = step(specimenState, [{ type: 'MergeLabSpecimens', specimenIds: [8, 4] }], 1);
    expect(first.state.labSeeds).toEqual(['prism-fig']);
    expect(first.state.labSeeds).toEqual(second.state.labSeeds);
    expect(first.state.labSpecimens).toEqual([]);
    expect(first.state.discoveries).toContain('lab:electric+frozen:prism-fig');
    expect(first.state.coins).toBe(specimenState.coins);
    expect(first.state.plots).toEqual(specimenState.plots);
    expect(first.state.crate).toEqual(specimenState.crate);
    expect(first.events).toContainEqual({ type: 'LabMergeCompleted', seedId: 'prism-fig', specimens: [4, 8], chainLength: 1 });
  });

  it('resolves a nearby matching specimen as a deterministic chain reaction', () => {
    const chainState = { ...specimenState, labSpecimens: [...specimenState.labSpecimens, { id: 12, fruit: golden }] };
    const result = step(chainState, [{ type: 'MergeLabSpecimens', specimenIds: [12, 8, 4] }], 1);
    expect(result.state.labSeeds).toEqual(['sunburst']);
    expect(result.state.discoveries).toContain('lab:electric+frozen:prism-fig');
    expect(result.state.discoveries).toContain('lab:prism-fig+golden:sunburst');
    expect(result.state.labSpecimens).toEqual([]);
    expect(result.events).toContainEqual({ type: 'LabMergeCompleted', seedId: 'sunburst', specimens: [4, 8, 12], chainLength: 2 });
  });

  it('keeps wrong, repeated and missing specimen pairs in the tray', () => {
    const wrong = { ...specimenState, labSpecimens: [{ id: 4, fruit: frozen }, { id: 8, fruit: golden }] };
    const result = step(wrong, [{ type: 'MergeLabSpecimens', specimenIds: [4, 8] }], 1);
    expect(result.state.labSpecimens).toEqual(wrong.labSpecimens);
    expect(result.events).toContainEqual({ type: 'LabMergeRejected', reason: 'invalid-pair' });
    expect(step(specimenState, [{ type: 'MergeLabSpecimens', specimenIds: [4, 4] }], 1).state.labSeeds).toEqual([]);
  });
});
