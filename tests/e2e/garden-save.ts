import type { Page } from '@playwright/test';
import { createInitialState } from '../../src/sim';
import { encodeSave } from '../../src/save/codec';

/**
 * Starts the page with a saved garden at the given XP, so specs can use seeds that unlock later.
 * The save is written before the app opens IndexedDB, and only if no save exists yet, so reloads
 * keep whatever the spec did.
 */
export async function startWithSave(page: Page, xp = 25, options: {
  scriptedGiantUsed?: boolean; scriptedGoldenUsed?: boolean; plantCount?: number; twistrootPlantedAt?: number; twistrootWaterCount?: number; extraRipeSunny?: boolean; extraRipeSunnyAt?: number; savedAt?: number; coins?: number; seed?: number; mutationRngState?: number;
} = {}): Promise<void> {
  const initial = createInitialState(options.seed ?? 20261022, 0, { xp });
  const plots = initial.plots.map((plot) => {
    if (options.twistrootPlantedAt !== undefined && plot.id === 'plot-0') return { ...plot,
      plant: { speciesId: 'twistroot' as const, plantedAt: options.twistrootPlantedAt, size: 'regular' as const,
        mutationSeed: 7, waterCount: options.twistrootWaterCount ?? 0, scriptedGiant: true } };
    if (options.extraRipeSunny && plot.id === 'plot-1') return { ...plot,
      plant: { speciesId: 'sunny-sprout' as const, plantedAt: options.extraRipeSunnyAt ?? options.twistrootPlantedAt! - 20_000,
        size: 'regular' as const, mutationSeed: 11, mutations: [] } };
    return plot;
  });
  const envelope = encodeSave({ ...initial, coins: options.coins ?? initial.coins, plots, mutationRngState: options.mutationRngState ?? 2, plantCount: options.plantCount ?? 100, scriptedGiantUsed: options.scriptedGiantUsed ?? true, scriptedGoldenUsed: options.scriptedGoldenUsed ?? true }, options.savedAt ?? 0, 'e2e');
  await page.addInitScript((save) => {
    const injected = 'mutation-garden-e2e-save-injected';
    if (sessionStorage.getItem(injected)) return;
    sessionStorage.setItem(injected, '1');
    const request = indexedDB.open('mutation-garden', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => {
      const store = request.result.transaction('saves', 'readwrite').objectStore('saves');
      const existing = store.get('slot-0');
      existing.onsuccess = () => {
        if (existing.result === undefined) store.put(save, 'slot-0');
      };
    };
  }, envelope);
}
