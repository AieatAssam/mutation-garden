import { describe, expect, it } from 'vitest';
import { createInitialState, INITIAL_COINS, SPECIES } from '../index';

const expectedStages = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];

describe('species content', () => {
  it('contains unique stable species IDs', () => {
    expect(SPECIES.map(({ id }) => id)).toEqual([
      'sunny-sprout',
      'bubble-berry',
      'twistroot',
      'puffcap',
      'lantern-pod',
      'comet-pear',
      'clockvine',
      'dewbell',
    ]);
    expect(new Set(SPECIES.map(({ id }) => id)).size).toBe(SPECIES.length);
  });

  it.each([
    { id: 'sunny-sprout', name: 'Sunny Sprout', seedCost: 1, baseValue: 2, unlockLevel: 1 },
    { id: 'bubble-berry', name: 'Bubble Berry', seedCost: 5, baseValue: 6, unlockLevel: 2 },
    { id: 'twistroot', name: 'Twistroot', seedCost: 5, baseValue: 10, unlockLevel: 3 },
    { id: 'puffcap', name: 'Puffcap', seedCost: 6, baseValue: 11, unlockLevel: 4 },
    { id: 'lantern-pod', name: 'Lantern Pod', seedCost: 12, baseValue: 35, unlockLevel: 6 },
    { id: 'comet-pear', name: 'Comet Pear', seedCost: 24, baseValue: 46, unlockLevel: 9 },
    { id: 'clockvine', name: 'Clockvine', seedCost: 20, baseValue: 46, unlockLevel: 11 },
    { id: 'dewbell', name: 'Dewbell', seedCost: 34, baseValue: 82, unlockLevel: 13 },
  ])('defines $name with its seed price, reward and unlock', (expected) => {
    const species = SPECIES.find(({ id }) => id === expected.id);

    expect(species?.name).toBe(expected.name);
    expect(species?.seedCost).toBe(expected.seedCost);
    expect(species?.baseValue).toBe(expected.baseValue);
    expect(species?.unlockLevel).toBe(expected.unlockLevel);
  });

  it.each([
    {
      id: 'sunny-sprout',
      durationMs: 8_000,
      stageStartsAtMs: [0, 1_000, 3_000, 7_000, 8_000],
    },
    {
      id: 'bubble-berry',
      durationMs: 15_000,
      stageStartsAtMs: [0, 2_000, 6_000, 13_000, 15_000],
    },
    {
      id: 'twistroot',
      durationMs: 25_000,
      stageStartsAtMs: [0, 3_000, 10_000, 22_000, 25_000],
    },
    { id: 'lantern-pod', durationMs: 45_000, stageStartsAtMs: [0, 4_000, 18_000, 38_000, 45_000] },
    { id: 'comet-pear', durationMs: 75_000, stageStartsAtMs: [0, 7_500, 30_000, 60_000, 75_000] },
    { id: 'clockvine', durationMs: 55_000, stageStartsAtMs: [0, 5_500, 22_000, 44_000, 55_000] },
    { id: 'dewbell', durationMs: 90_000, stageStartsAtMs: [0, 9_000, 36_000, 72_000, 90_000] },
  ] as const)('%s has all growth stages through its total duration', (expected) => {
    const species = SPECIES.find(({ id }) => id === expected.id);

    expect(species).toBeDefined();
    expect(species?.growthDurationMs).toBe(expected.durationMs);
    expect(species?.stages.map(({ stage }) => stage)).toEqual(expectedStages);
    expect(species?.stages.map(({ startsAtMs }) => startsAtMs)).toEqual(
      expected.stageStartsAtMs,
    );
    expect(species?.stages[0]?.startsAtMs).toBe(0);
    expect(species?.stages.at(-1)?.startsAtMs).toBe(expected.durationMs);
  });

  it('uses integer prices and rewards; only the starting crop must be affordable initially', () => {
    expect(INITIAL_COINS).toBe(12);
    expect(createInitialState(1, 0).coins).toBe(12);

    for (const species of SPECIES) {
      expect(Number.isSafeInteger(species.seedCost)).toBe(true);
      expect(Number.isSafeInteger(species.baseValue)).toBe(true);
      expect(species.seedCost).toBeGreaterThanOrEqual(0);
      expect(species.baseValue).toBeGreaterThanOrEqual(0);
      if (species.unlockLevel === 1) expect(species.seedCost).toBeLessThanOrEqual(INITIAL_COINS);
    }
  });

  it('makes a Sunny harvest worth more than the seed, so repeated cycles do not lose coins', () => {
    const sunny = SPECIES.find(({ id }) => id === 'sunny-sprout');

    expect(sunny).toBeDefined();
    expect(sunny!.baseValue).toBeGreaterThan(sunny!.seedCost);
    expect(sunny!.baseValue - sunny!.seedCost).toBeGreaterThanOrEqual(0);
  });
});
