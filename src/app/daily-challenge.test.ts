import { describe, expect, it } from 'vitest';
import { dailyBestKey, dailyChallengeDate, dailyChallengeSeed, recordDailyBest, readDailyBest } from './daily-challenge';

describe('daily challenge', () => {
  it('uses a stable UTC date seed shared for that date', () => {
    expect(dailyChallengeDate(Date.UTC(2026, 9, 25, 23, 59))).toBe('2026-10-25');
    expect(dailyChallengeSeed('2026-10-25')).toBe(dailyChallengeSeed('2026-10-25'));
    expect(dailyChallengeSeed('2026-10-25')).not.toBe(dailyChallengeSeed('2026-10-26'));
  });

  it('keeps the best score per day in local storage', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
    expect(readDailyBest('2026-10-25', storage)).toBe(0);
    expect(recordDailyBest('2026-10-25', 12, storage)).toBe(12);
    expect(recordDailyBest('2026-10-25', 8, storage)).toBe(12);
    expect(data.get(dailyBestKey('2026-10-25'))).toBe('12');
  });
});
