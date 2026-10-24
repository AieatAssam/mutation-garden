import { describe, expect, it } from 'vitest';
import { runGreedy } from '../../scripts/balance';

describe('greedy balance pacing', () => {
  it('reaches the early progression milestones in ten simulated minutes', () => {
    const { milestones } = runGreedy(10);
    expect(milestones['first harvest']).toBeGreaterThanOrEqual(0);
    expect(milestones['first harvest']).toBeLessThanOrEqual(30_000);
    expect(milestones['first mutation']).toBeLessThanOrEqual(60_000);
    expect(milestones['level 2']).toBeGreaterThanOrEqual(60_000);
    expect(milestones['level 2']).toBeLessThanOrEqual(100_000);
    expect(milestones['first purchase']).toBeGreaterThanOrEqual(120_000);
    expect(milestones['first purchase']).toBeLessThanOrEqual(240_000);
    expect(milestones['plot 7']).toBeGreaterThanOrEqual(180_000);
    expect(milestones['plot 7']).toBeLessThanOrEqual(300_000);
    expect(milestones['Puffcap / level 4']).toBeGreaterThanOrEqual(480_000);
    expect(milestones['Puffcap / level 4']).toBeLessThanOrEqual(720_000);
  });

  it('keeps purchases within three minutes through a thirty-minute session', () => {
    const { milestones, purchases } = runGreedy(30);
    const laterPurchases = purchases.filter((time) => time > milestones['Puffcap / level 4']! && time <= 1_800_000);
    let previous = milestones['Puffcap / level 4']!;
    for (const purchase of laterPurchases) {
      expect(purchase - previous).toBeLessThanOrEqual(180_000);
      previous = purchase;
    }
    expect(1_800_000 - previous).toBeLessThanOrEqual(180_000);
  });
});
