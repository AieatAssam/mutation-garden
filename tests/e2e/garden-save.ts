import type { Page } from '@playwright/test';
import { createInitialState } from '../../src/sim';
import { encodeSave } from '../../src/save/codec';

/**
 * Starts the page with a saved garden at the given XP, so specs can use seeds that unlock later.
 * The save is written before the app opens IndexedDB, and only if no save exists yet, so reloads
 * keep whatever the spec did.
 */
export async function startWithSave(page: Page, xp = 25): Promise<void> {
  const envelope = encodeSave(createInitialState(20261022, 0, { xp }), 0, 'e2e');
  await page.addInitScript((save) => {
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
