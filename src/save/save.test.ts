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
    for (const order of [
      { index: -1, progress: 0 }, { index: 0, progress: 3 }, { index: 99, progress: 0 },
      { index: 0, progress: -1 }, { index: 0, progress: 0, title: 'forged' },
      { index: 2, progress: 1 }, { index: 3, progress: 0 },
    ]) {
      const invalid = { ...envelope.state, order };
      expect(decodeSave({ ...envelope, state: invalid, checksum: checksum(JSON.stringify(invalid)) }))
        .toMatchObject({ ok: false, reason: 'invalid state' });
    }
    expect(decodeSave('nonsense')).toMatchObject({ ok: false });
  });

  it('round-trips an expanded crate without accepting capacity the save does not own', () => {
    const fruit = { speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 2, xp: 2 };
    const state = { ...garden(), owned: ['crate-1', 'crate-2'] as const, crate: Array.from({ length: 24 }, () => fruit) };
    expect(decodeSave(encodeSave(state, 1_000, 'test'))).toMatchObject({ ok: true, state });
    const invalid = { ...state, owned: [], crate: Array.from({ length: 13 }, () => fruit) };
    expect(decodeSave(encodeSave(invalid, 1_000, 'test'))).toMatchObject({ ok: false, reason: 'invalid state' });
  });

  it('round-trips one-shot Clockvine and Dewbell state', () => {
    const state = garden();
    const planted = { ...state, plots: state.plots.map((plot, index) => index === 0
      ? { ...plot, plant: { speciesId: 'clockvine' as const, plantedAt: 1_000, mutationSeed: 9, boostMs: 2_000, clockBoostMs: 2_000, clockBoostedBy: ['plot-1'], dewUsed: true } }
      : plot) };
    expect(decodeSave(encodeSave(planted, 5_000, 'test'))).toMatchObject({ ok: true, state: planted });
  });

  it('persists the new mutation traits in a plant and a crate fruit', () => {
    const state = garden();
    const twin = { ...state, plots: state.plots.map((plot, index) => index === 0 ? { ...plot,
      plant: { speciesId: 'sunny-sprout' as const, plantedAt: 1_000, mutationSeed: 9, mutations: ['frozen', 'electric', 'twin'] as const } } : plot),
      crate: [{ speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: ['twin'] as const, value: 8, xp: 2 }] };
    expect(decodeSave(encodeSave(twin, 5_000, 'test'))).toMatchObject({ ok: true, state: twin });
  });

  it('loads the committed schema-1 fixture (every future migration must keep this passing)', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-1.json', 'utf8'));
    const result = decodeSave(fixture);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.plots[0]?.plant).toMatchObject({ speciesId: 'sunny-sprout' });
  });

  it('migrates schema 8 saves with an empty Lantern Pod seed balance', () => {
    const state = garden();
    const { bonusSeeds: _bonusSeeds, ...schema8State } = state;
    void _bonusSeeds;
    const legacy = { schema: 8, savedAt: 5_000, appVersion: 'test', state: { ...schema8State, schema: 8 }, checksum: checksum(JSON.stringify({ ...schema8State, schema: 8 })) };
    expect(decodeSave(legacy)).toMatchObject({ ok: true, state: { schema: 10, bonusSeeds: 0 } });
  });

  it('continues a saved mature mutation without rerolling it', () => {
    let state = step(createInitialState(44, 0, { xp: 900 }), [{ type: 'Plant', plotId: 'plot-0', seedId: 'twistroot' }], 0).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 5_000).state;
    state = step(state, [{ type: 'Water', plotId: 'plot-0' }], 6_000).state;
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

  it('migrates schema 2 saves through the shop and crate fields', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-2.json', 'utf8'));
    const decoded = decodeSave(fixture);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.state).toMatchObject({ schema: 10, owned: [], fertiliser: 0, plantCount: 1, crate: [], sellingSince: null, order: { index: 0, progress: 0 }, crystalReadyPlots: [], rainbowPlots: [] });
  });

  it('migrates the M2 schema 3 fixture with mutations to an empty, idle crate', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-3.json', 'utf8'));
    const decoded = decodeSave(fixture);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state).toMatchObject({ schema: 10, crate: [], sellingSince: null, order: { index: 0, progress: 0 }, crystalReadyPlots: [], rainbowPlots: [] });
      expect(decoded.state.plots[0]?.plant).toMatchObject({ mutations: ['golden'] });
    }
  });

  it('migrates schema 4 without changing saved fields and starts its first order', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-4.json', 'utf8'));
    const original = fixture.state;
    const decoded = decodeSave(fixture);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state).toMatchObject({ schema: 10, order: { index: 0, progress: 0 }, crate: original.crate, sellingSince: original.sellingSince, owned: original.owned, fertiliser: original.fertiliser, crystalReadyPlots: [], rainbowPlots: [] });
      const { crystalReadyPlots: _crystal, rainbowPlots: _rainbow, bonusSeeds: _bonusSeeds, labSpecimens: _lab, nextLabSpecimenId: _nextLab, ...migrated } = decoded.state;
      void _crystal; void _rainbow; void _bonusSeeds; void _lab; void _nextLab;
      expect(migrated.plots[0]?.lastSeedId).toBe('twistroot');
      expect({ ...migrated, schema: 4, order: undefined, plots: original.plots }).toEqual({ ...original, order: undefined });
    }
  });

  it('migrates a schema 5 fixture with the new one-shot plot flags empty', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-5.json', 'utf8'));
    const decoded = decodeSave(fixture);
    expect(decoded).toMatchObject({ ok: true, state: { schema: 10, crystalReadyPlots: [], rainbowPlots: [] } });
  });

  it('migrates schema 6 without changing plant fields', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/saves/schema-6.json', 'utf8'));
    const decoded = decodeSave(fixture);
    expect(decoded).toMatchObject({ ok: true, state: { schema: 10, bonusSeeds: 0 } });
    if (decoded.ok) expect(decoded.state.plots[0]?.plant).toMatchObject({ speciesId: 'twistroot', plantedAt: 10_000 });
  });

  it('does not replay an order reward after saving and resuming', () => {
    const fruit = { speciesId: 'sunny-sprout' as const, size: 'regular' as const, mutations: [], value: 2, xp: 0 };
    const state = { ...garden(), order: { index: 0, progress: 2 }, crate: [fruit], sellingSince: 0 };
    const completed = step(state, [], 1_200);
    expect(completed.events).toContainEqual({ type: 'OrderCompleted', title: 'Sell 3 Sunny Sprouts', coins: 6, xp: 10 });
    const decoded = decodeSave(encodeSave(completed.state, 1_200, 'test'));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const resumed = step(decoded.state, [], 2_400);
      expect(resumed.events).not.toContainEqual(expect.objectContaining({ type: 'OrderCompleted' }));
      expect(resumed.state).toMatchObject({ order: { index: 1, progress: 0 }, coins: completed.state.coins, xp: completed.state.xp });
    }
  });

  it('persists partial order progress across a save', () => {
    const state = { ...garden(), order: { index: 0, progress: 2 } };
    const decoded = decodeSave(encodeSave(state, 1_000, 'test'));
    expect(decoded).toMatchObject({ ok: true, state: { order: { index: 0, progress: 2 } } });
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
    const backend = memoryBackend();
    await backend.set([['settings', { sound: false, music: true }]]);
    const store = createSaveStore(backend, 'test', () => 1);
    expect(await store.loadSettings()).toEqual({ sound: false, music: true, haptics: false, largeText: false });
    await backend.set([['settings', undefined]]);
    expect(await store.loadSettings()).toEqual(DEFAULT_SETTINGS);
    await store.saveSettings({ sound: false, music: true, haptics: true, largeText: true });
    expect(await store.loadSettings()).toEqual({ sound: false, music: true, haptics: true, largeText: true });
  });
});
