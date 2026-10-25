import type { TraitId } from '../state/types';

export const MUTATIONS: Readonly<Record<TraitId, { value: number; naturalChance: number; ruleChance: number; guarantee: number | null }>> = {
  giant: { value: 2, naturalChance: 0.03, ruleChance: 0.4, guarantee: null },
  golden: { value: 4, naturalChance: 0.01, ruleChance: 0.4, guarantee: 25 },
  glowing: { value: 3, naturalChance: 0.01, ruleChance: 1, guarantee: null },
  crystal: { value: 6, naturalChance: 0.003, ruleChance: 0.3, guarantee: 40 },
  rainbow: { value: 10, naturalChance: 0, ruleChance: 1, guarantee: null },
  frozen: { value: 5, naturalChance: 0.002, ruleChance: 1, guarantee: null },
  electric: { value: 7, naturalChance: 0.001, ruleChance: 1, guarantee: null },
  twin: { value: 4, naturalChance: 0.002, ruleChance: 1, guarantee: null },
};

/** Stable Murmur-style finalizer, used to derive a trait roll without advancing state. */
export function mutationRoll(seed: number, traitId: TraitId): number {
  let h = (seed ^ traitId.split('').reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x1_0000_0000;
}
