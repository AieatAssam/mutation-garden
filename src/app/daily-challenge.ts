export function dailyChallengeDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function dailyChallengeSeed(date: string): number {
  let hash = 0x811c9dc5;
  for (const character of `mutation-garden:${date}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return hash >>> 0;
}

export function dailyBestKey(date: string): string {
  return `mutation-garden:daily-best:${date}`;
}

export function readDailyBest(date: string, storage: Pick<Storage, 'getItem'> = localStorage): number {
  const value = Number(storage.getItem(dailyBestKey(date)));
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function recordDailyBest(date: string, score: number, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): number {
  const best = Math.max(readDailyBest(date, storage), Number.isSafeInteger(score) ? score : 0);
  if (best > 0) storage.setItem(dailyBestKey(date), String(best));
  return best;
}
