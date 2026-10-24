import { describe, expect, it } from 'vitest';
import { createInitialState, INITIAL_COINS, SPECIES } from '../index';

const expectedStages = ['Seed', 'Sprout', 'Growing', 'Mature', 'Harvestable'];

describe('starter species content', () => {
  it('contains unique stable species IDs', () => {
    expect(SPECIES.map(({ id }) => id)).toEqual([
      'sunny-sprout',
      'bubble-berry',
      'twistroot',
      'puffcap',
    ]);
    expect(new Set(SPECIES.map(({ id }) => id)).size).toBe(SPECIES.length);
  });

  it.each([
    { id: 'sunny-sprout', name: 'Sunny Sprout', seedCost: 1, baseValue: 2 },
    { id: 'bubble-berry', name: 'Bubble Berry', seedCost: 3, baseValue: 6 },
    { id: 'twistroot', name: 'Twistroot', seedCost: 5, baseValue: 10 },
    { id: 'puffcap', name: 'Puffcap', seedCost: 6, baseValue: 14 },
  ])('defines $name with the M1-02 price and reward', (expected) => {
    const species = SPECIES.find(({ id }) => id === expected.id);

    expect(species?.name).toBe(expected.name);
    expect(species?.seedCost).toBe(expected.seedCost);
    expect(species?.baseValue).toBe(expected.baseValue);
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

  it('uses integer prices and rewards that every starter can afford initially', () => {
    expect(INITIAL_COINS).toBe(12);
    expect(createInitialState(1, 0).coins).toBe(12);

    for (const species of SPECIES) {
      expect(Number.isSafeInteger(species.seedCost)).toBe(true);
      expect(Number.isSafeInteger(species.baseValue)).toBe(true);
      expect(species.seedCost).toBeGreaterThanOrEqual(0);
      expect(species.baseValue).toBeGreaterThanOrEqual(0);
      expect(species.seedCost).toBeLessThanOrEqual(INITIAL_COINS);
    }
  });

  it('makes a Sunny harvest worth more than the seed, so repeated cycles do not lose coins', () => {
    const sunny = SPECIES.find(({ id }) => id === 'sunny-sprout');

    expect(sunny).toBeDefined();
    expect(sunny!.baseValue).toBeGreaterThan(sunny!.seedCost);
    expect(sunny!.baseValue - sunny!.seedCost).toBeGreaterThanOrEqual(0);
  });
});
