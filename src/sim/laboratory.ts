import { MAX_LAB_SEEDS, MAX_LAB_SPECIMENS } from './content/laboratory';
import { crateCapacity } from './content/species';
import type { Fruit, GardenState, LabSeedId, SimEvent, TraitId } from './state/types';

const RECIPES: readonly { readonly traits: readonly [TraitId, TraitId]; readonly seed: LabSeedId }[] = [
  { traits: ['frozen', 'electric'], seed: 'prism-fig' },
  { traits: ['golden', 'glowing'], seed: 'sunburst' },
];
const CHAIN_RECIPES: readonly { readonly from: LabSeedId; readonly trait: TraitId; readonly seed: LabSeedId }[] = [
  { from: 'prism-fig', trait: 'golden', seed: 'sunburst' },
  { from: 'sunburst', trait: 'twin', seed: 'prism-fig' },
];

function sameFruit(a: Fruit, b: Fruit): boolean {
  return a.speciesId === b.speciesId && a.size === b.size && a.value === b.value && a.xp === b.xp
    && a.mutations.length === b.mutations.length && a.mutations.every((trait, index) => trait === b.mutations[index]);
}

export function mergeLabSpecimens(state: GardenState, specimenIds: readonly number[]): { readonly state: GardenState; readonly events: readonly SimEvent[] } {
  if (specimenIds.length < 2 || specimenIds.length > MAX_LAB_SPECIMENS
    || specimenIds.some((id) => !Number.isSafeInteger(id)) || new Set(specimenIds).size !== specimenIds.length) {
    return { state, events: [{ type: 'LabMergeRejected', reason: 'invalid-pair' }] };
  }
  const selected = specimenIds.slice().sort((a, b) => a - b).map((id) => state.labSpecimens.find((specimen) => specimen.id === id));
  if (selected.some((specimen) => !specimen)) return { state, events: [{ type: 'LabMergeRejected', reason: 'invalid-pair' }] };
  let pair: readonly [number, number] | undefined;
  let seed: LabSeedId | undefined;
  const discoveredRecipes: string[] = [];
  for (let firstIndex = 0; firstIndex < selected.length && !pair; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < selected.length; secondIndex += 1) {
      const first = selected[firstIndex]!;
      const second = selected[secondIndex]!;
      const recipe = RECIPES.find(({ traits }) => first.fruit.mutations.includes(traits[0]) && second.fruit.mutations.includes(traits[1])
        || first.fruit.mutations.includes(traits[1]) && second.fruit.mutations.includes(traits[0]));
      if (recipe) { pair = [first.id, second.id]; seed = recipe.seed; discoveredRecipes.push(`lab:${recipe.traits.slice().sort().join('+')}:${recipe.seed}`); break; }
    }
  }
  if (!pair || !seed) return { state, events: [{ type: 'LabMergeRejected', reason: 'invalid-pair' }] };
  if (state.labSeeds.length >= MAX_LAB_SEEDS) return { state, events: [{ type: 'LabMergeRejected', reason: 'seed-tray-full' }] };
  const consumed = [...pair];
  let chainLength = 1;
  while (true) {
    const next = selected.find((specimen) => specimen && !consumed.includes(specimen.id)
      && CHAIN_RECIPES.some(({ from, trait }) => from === seed && specimen.fruit.mutations.includes(trait)));
    if (!next) break;
    const chain = CHAIN_RECIPES.find(({ from, trait }) => from === seed && next.fruit.mutations.includes(trait))!;
    discoveredRecipes.push(`lab:${chain.from}+${chain.trait}:${chain.seed}`);
    consumed.push(next.id); seed = chain.seed; chainLength += 1;
  }
  return {
    state: {
      ...state,
      labSpecimens: state.labSpecimens.filter(({ id }) => !consumed.includes(id)),
      labSeeds: [...state.labSeeds, seed],
      discoveries: [...state.discoveries, ...discoveredRecipes.filter((recipe) => !state.discoveries.includes(recipe))],
    },
    events: [{ type: 'LabMergeCompleted', seedId: seed, specimens: consumed, chainLength }],
  };
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

export function returnLabSpecimens(state: GardenState, specimenIds: readonly number[]): { readonly state: GardenState; readonly events: readonly SimEvent[] } {
  const ids = [...new Set(specimenIds)];
  const returned = state.labSpecimens.filter(({ id }) => ids.includes(id));
  if (!ids.length || ids.length !== specimenIds.length || returned.length !== ids.length) {
    return { state, events: [{ type: 'LabReturnRejected', reason: 'invalid-selection' }] };
  }
  if (state.crate.length + returned.length > crateCapacity(state.owned)) {
    return { state, events: [{ type: 'LabReturnRejected', reason: 'crate-full' }] };
  }
  return {
    state: { ...state, crate: [...state.crate, ...returned.map(({ fruit }) => fruit)], labSpecimens: state.labSpecimens.filter(({ id }) => !ids.includes(id)) },
    events: [{ type: 'LabSpecimensReturned', specimens: ids }],
  };
}
