import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialState, SIM_SCHEMA_VERSION, step } from '../sim';
import { checksum, decodeSave, encodeSave } from './codec';
import { createSaveStore, DEFAULT_SETTINGS, localStorageBackend, memoryBackend, StaleSaveError } from './store';

const garden = () => step(createInitialState(42, 1_000), [{ type: 'Plant', plotId: 'plot-0', seedId: 'sunny-sprout' }], 1_000).state;

describe('save codec', () => {
  it('round-trips a garden and rejects tampering, newer schemas and bad shapes', () => {
    const envelope = encodeSave(garden(), 5_000, 'test');
    expect(decodeSave(JSON.parse(JSON.stringify(envelope)))).toEqual({ ok: true, state: garden(), savedAt: 5_000 });
    expect(decodeSave({ ...envelope, state: { ...envelope.state, coins: 999 } })).toMatchObject({ ok: false, reason: 'checksum mismatch' });
    expect(decodeSave({ ...envelope, schema: 99 })).toMatchObject({ ok: false, reason: 'save is from a newer version' });
    const bad = { ...envelope.state, plots: [{ id: 'plot-0', plant: { speciesId: 'cactus', plantedAt: 1 } }] };
    expect(decodeSave({ ...envelope, state: bad, checksum: checksum(JSON.stringify(bad)) })).toMatchObject({ ok: false, reason: 'invalid state' });
    expect(decodeSave('nonsense')).toMatchObject({ ok: false });
  });

  it('loads the committed schema-1 fixture (every future migration must keep this passing)', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-1.json', 'utf8'));
    const result = decodeSave(fixture);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.plots[0]?.plant).toMatchObject({ speciesId: 'sunny-sprout' });
  });

  it('continues a saved mature mutation without rerolling it', () => {
    const state = step(createInitialState(44, 0, { xp: 25 }), [{ type: 'Plant', plotId: 'plot-0', seedId: 'twistroot' }], 0).state;
    const matured = step(state, [], 22_000).state;
    const decoded = decodeSave(encodeSave(matured, 22_000, 'test'));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const resumed = step(decoded.state, [], 30_000);
      expect(resumed.events).not.toContainEqual(expect.objectContaining({ type: 'Mutated' }));
      expect(resumed.state.plots[0]?.plant?.mutations).toEqual(['giant']);
    }
  });

  it('migrates schema 2 plants without mutation rerolls', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-2.json', 'utf8'));
    const result = decodeSave(fixture);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.plots[0]?.plant).toMatchObject({ mutationSeed: 0xffff_ffff, waterCount: 1 });
      const matured = step(result.state, [], 40_000);
      expect(matured.state.plots[0]?.plant?.mutations).toEqual([]);
    }
  });
});

describe('save store', () => {
  it('keeps the previous good save as a backup and recovers from a corrupt main slot', async () => {
    const backend = memoryBackend();
    const store = createSaveStore(backend, 'test', () => 77);
    expect(await store.load()).toEqual({ kind: 'empty' });
    const first = garden();
    await store.save(first, 1);
    const second = step(first, [], 9_000).state;
    await store.save(second, 2);
    expect(await store.load()).toEqual({ kind: 'loaded', state: second, savedAt: 2 });

    backend.data.set('slot-0', { ...(backend.data.get('slot-0') as object), checksum: 'broken' });
    const recovered = await store.load();
    expect(recovered).toMatchObject({ kind: 'recovered', state: first, reason: 'checksum mismatch' });
    expect(backend.data.has('slot-0.corrupt-77')).toBe(true);
  });

  it('reports nothing recoverable rather than inventing a garden', async () => {
    const backend = memoryBackend();
    backend.data.set('slot-0', { junk: true });
    expect(await createSaveStore(backend, 'test', () => 1).load()).toMatchObject({ kind: 'recovered', state: null });
  });

  it('refuses to overwrite a save another tab wrote, and leaves a newer build\'s save alone', async () => {
    const backend = memoryBackend();
    const tabA = createSaveStore(backend, 'test', () => 1);
    const tabB = createSaveStore(backend, 'test', () => 1);
    await tabA.load();
    await tabB.load();
    const played = step(garden(), [], 5_000).state;
    await tabA.save(played, 1);
    await expect(tabB.save(garden(), 2)).rejects.toBeInstanceOf(StaleSaveError);
    expect(await tabA.load()).toMatchObject({ kind: 'loaded', state: played });

    const newer = { ...encodeSave(played, 3, 'future'), schema: SIM_SCHEMA_VERSION + 1 };
    backend.data.set('slot-0', newer);
    const old = createSaveStore(backend, 'test', () => 1);
    expect(await old.load()).toEqual({ kind: 'newer' });
    expect(backend.data.get('slot-0')).toEqual(newer);
    expect([...backend.data.keys()].some((key) => key.includes('corrupt'))).toBe(false);
  });

  it('keeps an unparseable localStorage save aside instead of giving up on storage', async () => {
    const data = new Map<string, string>([['mutation-garden:slot-0', '{"cut off']]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    } as Storage;
    const store = createSaveStore(localStorageBackend(storage), 'test', () => 5);
    expect(await store.load()).toMatchObject({ kind: 'recovered', state: null });
    expect(data.get('mutation-garden:slot-0.corrupt-5')).toBe(JSON.stringify('{"cut off'));
    await store.save(garden(), 6);
    expect(await store.load()).toMatchObject({ kind: 'loaded' });
  });

  it('stores settings with defaults for missing values', async () => {
    const store = createSaveStore(memoryBackend(), 'test', () => 1);
    expect(await store.loadSettings()).toEqual(DEFAULT_SETTINGS);
    await store.saveSettings({ sound: false, music: true });
    expect(await store.loadSettings()).toEqual({ sound: false, music: true });
  });
});
