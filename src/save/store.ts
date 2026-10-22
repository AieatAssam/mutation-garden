import type { GardenState } from '../sim';
import { decodeSave, encodeSave, type SaveEnvelope } from './codec';

/** A tiny key-value backend. Each set call is atomic for all its entries (one IndexedDB transaction). */
export interface SaveBackend {
  get(key: string): Promise<unknown>;
  set(entries: readonly (readonly [string, unknown])[]): Promise<void>;
}

const SLOT = 'slot-0';
const BACKUP = 'slot-0.bak';
const SETTINGS = 'settings';

export type LoadResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly state: GardenState; readonly savedAt: number }
  /** The main slot was unreadable; it is kept aside and the backup was loaded (or nothing was). */
  | { readonly kind: 'recovered'; readonly state: GardenState | null; readonly savedAt: number; readonly reason: string };

export interface Settings {
  readonly sound: boolean;
  readonly music: boolean;
}
export const DEFAULT_SETTINGS: Settings = { sound: true, music: true };

export interface SaveStore {
  load(): Promise<LoadResult>;
  /** Writes the new envelope and keeps the previous one as the backup, in one transaction. */
  save(state: GardenState, savedAt: number): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

export function createSaveStore(backend: SaveBackend, appVersion: string, nowMs: () => number): SaveStore {
  return {
    async load() {
      const raw = await backend.get(SLOT);
      if (raw === undefined || raw === null) return { kind: 'empty' };
      const main = decodeSave(raw);
      if (main.ok) return { kind: 'loaded', state: main.state, savedAt: main.savedAt };
      // Never silently reset: keep the bad blob for diagnosis and fall back to the last good save.
      await backend.set([[`${SLOT}.corrupt-${nowMs()}`, raw]]);
      const backup = decodeSave(await backend.get(BACKUP));
      return backup.ok
        ? { kind: 'recovered', state: backup.state, savedAt: backup.savedAt, reason: main.reason }
        : { kind: 'recovered', state: null, savedAt: 0, reason: main.reason };
    },
    async save(state, savedAt) {
      const previous = await backend.get(SLOT);
      const envelope: SaveEnvelope = encodeSave(state, savedAt, appVersion);
      const entries: [string, unknown][] = [[SLOT, envelope]];
      if (previous !== undefined && previous !== null && decodeSave(previous).ok) entries.push([BACKUP, previous]);
      await backend.set(entries);
    },
    async loadSettings() {
      const raw = await backend.get(SETTINGS) as Partial<Settings> | undefined;
      return {
        sound: typeof raw?.sound === 'boolean' ? raw.sound : DEFAULT_SETTINGS.sound,
        music: typeof raw?.music === 'boolean' ? raw.music : DEFAULT_SETTINGS.music,
      };
    },
    async saveSettings(settings) {
      await backend.set([[SETTINGS, settings]]);
    },
  };
}

export function memoryBackend(): SaveBackend & { readonly data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key) { return structuredClone(data.get(key)); },
    async set(entries) { for (const [key, value] of entries) data.set(key, structuredClone(value)); },
  };
}

/** IndexedDB database "mutation-garden", store "saves" (docs/architecture.md, Saves). */
export function indexedDbBackend(factory: IDBFactory = indexedDB): SaveBackend {
  let database: Promise<IDBDatabase> | null = null;
  const open = () => {
    database ??= new Promise((resolve, reject) => {
      const request = factory.open('mutation-garden', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saves');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return database;
  };
  return {
    async get(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction('saves', 'readonly').objectStore('saves').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async set(entries) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('saves', 'readwrite');
        const store = transaction.objectStore('saves');
        for (const [key, value] of entries) store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}

/** Fallback when IndexedDB is unavailable (some private modes). Writes all entries in one go. */
export function localStorageBackend(storage: Storage = localStorage): SaveBackend {
  const prefix = 'mutation-garden:';
  return {
    async get(key) {
      const text = storage.getItem(prefix + key);
      return text === null ? undefined : JSON.parse(text);
    },
    async set(entries) {
      for (const [key, value] of entries) storage.setItem(prefix + key, JSON.stringify(value));
    },
  };
}

/** Picks IndexedDB when it opens, else localStorage, else memory (progress lasts this visit only). */
export async function chooseBackend(): Promise<{ backend: SaveBackend; persistent: boolean }> {
  try {
    const backend = indexedDbBackend();
    await backend.get(SLOT);
    return { backend, persistent: true };
  } catch {
    try {
      const backend = localStorageBackend();
      await backend.get(SLOT);
      return { backend, persistent: true };
    } catch {
      return { backend: memoryBackend(), persistent: false };
    }
  }
}
