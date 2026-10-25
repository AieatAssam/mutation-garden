import { MAX_LAB_SPECIMENS } from './content/laboratory';
import type { Fruit, GardenState, SimEvent } from './state/types';

function sameFruit(a: Fruit, b: Fruit): boolean {
  return a.speciesId === b.speciesId && a.size === b.size && a.value === b.value && a.xp === b.xp
    && a.mutations.length === b.mutations.length && a.mutations.every((trait, index) => trait === b.mutations[index]);
}

export function storeLabSpecimen(state: GardenState, crateIndex: number, expectedFruit: Fruit): { readonly state: GardenState; readonly events: readonly SimEvent[] } {
  if (!Number.isSafeInteger(crateIndex) || crateIndex < 0) {
    return { state, events: [{ type: 'LabSpecimenRejected', reason: 'invalid-selection' }] };
  }
  if (state.labSpecimens.length >= MAX_LAB_SPECIMENS) {
    return { state, events: [{ type: 'LabSpecimenRejected', reason: 'laboratory-full' }] };
  }
  const fruit = state.crate[crateIndex];
  if (!fruit) return { state, events: [{ type: 'LabSpecimenRejected', reason: 'crate-empty' }] };
  if (!expectedFruit || typeof expectedFruit !== 'object' || !Array.isArray(expectedFruit.mutations)
    || !sameFruit(fruit, expectedFruit) || state.nextLabSpecimenId === Number.MAX_SAFE_INTEGER) {
    return { state, events: [{ type: 'LabSpecimenRejected', reason: 'invalid-selection' }] };
  }
  const specimenId = state.nextLabSpecimenId;
  return {
    state: {
      ...state,
      crate: state.crate.filter((_, index) => index !== crateIndex),
      labSpecimens: [...state.labSpecimens, { id: specimenId, fruit: { ...fruit, mutations: [...fruit.mutations] } }],
      nextLabSpecimenId: specimenId + 1,
    },
    events: [{ type: 'LabSpecimenStored', specimenId }],
  };
}
