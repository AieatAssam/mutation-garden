import type { GardenState } from '../sim';
import { decodeSave, encodeSave, NEWER_REASON, type SaveEnvelope } from './codec';

type Entries = readonly (readonly [string, unknown])[];

/** A tiny key-value backend. Each set call is atomic for all its entries (one IndexedDB transaction). */
export interface SaveBackend {
  get(key: string): Promise<unknown>;
  set(entries: Entries): Promise<void>;
  /**
   * Reads `key` and writes what `decide` returns, in one transaction, so a save started on pagehide
   * needs no second round trip. `decide` may throw to write nothing.
   */
  swap(key: string, decide: (current: unknown) => Entries): Promise<void>;
}

/** Another tab (or a newer build) wrote the save after this tab loaded it; this tab must stop saving. */
export class StaleSaveError extends Error {
  constructor() {
    super('The save was changed elsewhere');
    this.name = 'StaleSaveError';
  }
}

const SLOT = 'slot-0';
const BACKUP = 'slot-0.bak';
const SETTINGS = 'settings';

export type LoadResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly state: GardenState; readonly savedAt: number }
  /** The main slot was unreadable; it is kept aside and the backup was loaded (or nothing was). */
  | { readonly kind: 'recovered'; readonly state: GardenState | null; readonly savedAt: number; readonly reason: string }
  /** The save is from a newer build. It is left untouched and this build must not overwrite it. */
  | { readonly kind: 'newer' };

export interface Settings {
  readonly sound: boolean;
  readonly music: boolean;
}
export const DEFAULT_SETTINGS: Settings = { sound: true, music: true };

export interface SaveStore {
  load(): Promise<LoadResult>;
  /**
   * Writes the new envelope and keeps the previous one as the backup, in one transaction.
   * Throws StaleSaveError, writing nothing, if the slot changed since this store last loaded or saved it.
   */
  save(state: GardenState, savedAt: number): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

const checksumOf = (raw: unknown) =>
  raw && typeof raw === 'object' ? (raw as Partial<SaveEnvelope>).checksum ?? null : null;

export function createSaveStore(backend: SaveBackend, appVersion: string, nowMs: () => number): SaveStore {
  // Checksum of the envelope this store last saw in the slot; a different one means another writer.
  let known: string | null = null;
  return {
    async load() {
      const raw = await backend.get(SLOT);
      if (raw === undefined || raw === null) return { kind: 'empty' };
      const main = decodeSave(raw);
      if (main.ok) {
        known = checksumOf(raw);
        return { kind: 'loaded', state: main.state, savedAt: main.savedAt };
      }
      if (main.reason === NEWER_REASON) return { kind: 'newer' };
      // Never silently reset: keep the bad blob for diagnosis and fall back to the last good save.
      await backend.set([[`${SLOT}.corrupt-${nowMs()}`, raw]]);
      // The bad blob is safe aside, so the next save may replace it.
      known = checksumOf(raw);
      const backup = decodeSave(await backend.get(BACKUP));
      return backup.ok
        ? { kind: 'recovered', state: backup.state, savedAt: backup.savedAt, reason: main.reason }
        : { kind: 'recovered', state: null, savedAt: 0, reason: main.reason };
    },
    async save(state, savedAt) {
      const envelope: SaveEnvelope = encodeSave(state, savedAt, appVersion);
      await backend.swap(SLOT, (previous) => {
        if (checksumOf(previous) !== known) throw new StaleSaveError();
        const entries: [string, unknown][] = [[SLOT, envelope]];
        if (previous !== undefined && previous !== null && decodeSave(previous).ok) entries.push([BACKUP, previous]);
        return entries;
      });
      known = envelope.checksum;
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
    async swap(key, decide) {
      for (const [entry, value] of decide(structuredClone(data.get(key)))) data.set(entry, structuredClone(value));
    },
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
    async swap(key, decide) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('saves', 'readwrite');
        const store = transaction.objectStore('saves');
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            for (const [entry, value] of decide(request.result)) store.put(value, entry);
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
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
  const get = (key: string): unknown => {
    const text = storage.getItem(prefix + key);
    if (text === null) return undefined;
    // Unparseable text goes back as-is, so the normal corrupt-save path keeps it aside.
    try { return JSON.parse(text); } catch { return text; }
  };
  const set = (entries: Entries) => {
    for (const [key, value] of entries) storage.setItem(prefix + key, JSON.stringify(value));
  };
  return {
    async get(key) { return get(key); },
    async set(entries) { set(entries); },
    async swap(key, decide) { set(decide(get(key))); },
  };
}

/** Picks IndexedDB when it opens, else localStorage, else memory (progress lasts this visit only). */
export async function chooseBackend(timeoutMs = 4_000): Promise<{ backend: SaveBackend; persistent: boolean }> {
  let timer = 0;
  // An IndexedDB open that never settles must not freeze the game; play on without saving instead,
  // rather than writing a second save to localStorage beside one IndexedDB may still hold.
  const hung = new Promise<'hung'>((resolve) => { timer = setTimeout(() => resolve('hung'), timeoutMs) as unknown as number; });
  try {
    const backend = indexedDbBackend();
    const result = await Promise.race([backend.get(SLOT).then(() => 'ok' as const), hung]);
    if (result === 'hung') return { backend: memoryBackend(), persistent: false };
    return { backend, persistent: true };
  } catch {
    try {
      const backend = localStorageBackend();
      await backend.get(SLOT);
      return { backend, persistent: true };
    } catch {
      return { backend: memoryBackend(), persistent: false };
    }
  } finally {
    clearTimeout(timer);
  }
}
