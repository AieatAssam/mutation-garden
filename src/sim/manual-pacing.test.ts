import { describe, expect, it } from 'vitest';
import { createInitialState, getSnapshot, step } from './index';
import { SPECIES, xpForLevel } from './content/species';
import type { GardenState, ShopItemId, SpeciesId } from './state/types';

const MUTATION_REWARDS = SPECIES.flatMap(({ id }) =>
  ['giant', 'golden', 'glowing', 'crystal', 'rainbow', 'frozen', 'electric', 'twin'].map((trait) => `${id}:${trait}`));
const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);
const WINDOW_MS = 5 * 60_000;

function rateFor(owned: readonly ShopItemId[], seedId: SpeciesId, level: number, helper: boolean): number {
  return SEEDS.reduce((sum, seed) => {
    const initial = createInitialState(seed, 0, { xp: xpForLevel(level) });
    let state: GardenState = {
      ...initial,
      coins: initial.coins + 500,
      owned,
      plantCount: 100,
      rewardsPaid: MUTATION_REWARDS,
      scriptedGiantUsed: true,
      scriptedGoldenUsed: true,
    };
    for (let tick = 1; tick <= WINDOW_MS / 1_000; tick += 1) {
      const nowMs = tick * 1_000;
      state = step(state, [], nowMs).state;
      const plot = getSnapshot(state).plots[0]!;
      const commands: Parameters<typeof step>[1][number][] = [];
      if (!helper && plot.plant?.stage === 'Harvestable') commands.push({ type: 'Harvest', plotIds: [plot.id] });
      const seedCost = SPECIES.find(({ id }) => id === seedId)!.seedCost;
      if (!plot.plant && state.coins >= seedCost) commands.push({ type: 'Plant', plotId: plot.id, seedId });
      if (state.crate.length && state.sellingSince === null) commands.push({ type: 'StartSelling' });
      state = step(state, commands, nowMs).state;
    }
    return sum + (state.coins - initial.coins - 500) * 60_000 / WINDOW_MS;
  }, 0) / SEEDS.length;
}

describe('M4 automation economy pacing', () => {
  it('measures net coins per minute through sprinkler, helper and auto-sell stages', () => {
    const sprinkler = rateFor(['sprinkler'], 'puffcap', 5, false);
    const helper = rateFor(['sprinkler', 'harvest-helper', 'seed-hopper'], 'lantern-pod', 7, true);
    const autoSell = rateFor(['sprinkler', 'harvest-helper', 'seed-hopper', 'delivery-cart'], 'comet-pear', 10, true);
    expect(sprinkler).toBeGreaterThanOrEqual(28);
    expect(sprinkler).toBeLessThanOrEqual(32);
    expect(helper).toBeGreaterThanOrEqual(45);
    expect(helper).toBeLessThanOrEqual(50);
    expect(autoSell).toBeGreaterThanOrEqual(70);
    expect(autoSell).toBeLessThanOrEqual(77);
    expect(helper).toBeGreaterThan(sprinkler);
    expect(autoSell).toBeGreaterThan(helper);
  });
});
