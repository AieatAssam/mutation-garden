import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialState, step } from '../sim';
import { checksum, decodeSave, encodeSave } from './codec';
import { createSaveStore, DEFAULT_SETTINGS, memoryBackend } from './store';

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

  it('stores settings with defaults for missing values', async () => {
    const store = createSaveStore(memoryBackend(), 'test', () => 1);
    expect(await store.loadSettings()).toEqual(DEFAULT_SETTINGS);
    await store.saveSettings({ sound: false, music: true });
    expect(await store.loadSettings()).toEqual({ sound: false, music: true });
  });
});
