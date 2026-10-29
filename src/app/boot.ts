// Boot: wires the sim loop to rendering, input, UI rewards and sound.
import { createRenderer } from '../render/renderer';
import { palette } from '../render/palette';
import { createInitialState, getSnapshot, MUTATIONS, SPECIES } from '../sim';
import type { Command, GardenSnapshot, SimEvent, SpeciesId } from '../sim';
import { chooseBackend, createSaveStore, DEFAULT_SETTINGS, StaleSaveError, type Settings } from '../save/store';
import { hintFor, mutationOpportunitiesFor } from './hints';
import { createPointerInput } from '../input/pointer';
import { createGardenUI } from '../ui/garden-ui';
import { createRewardLayer } from '../ui/rewards';
import { createMutationReveal } from '../ui/mutation-reveal';
import { createNoticeQueue, readingTimeMs } from '../ui/notice-queue';
import { createSfx } from '../audio/sfx';
import { createPageLifecycle } from './lifecycle';
import { createFixedStepLoop } from './loop';
import { advanceOffline, capClockOffset } from './offline';
import { dailyChallengeDate, dailyChallengeSeed, readDailyBest, recordDailyBest } from './daily-challenge';
import {
  commandForPlotActivation,
  commandForSwipeHarvest,
  createPlotActivationGuard,
} from './commands';

export function boot(canvas: HTMLCanvasElement): () => void {
  document.body.style.background = palette.environment['sky-day'].horizon;
  // Each new garden gets its own seed, so yield sizes (and later mutations) differ between players.
  const startedAt = Date.now();
  const dailyMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('daily');
  const dailyDate = dailyChallengeDate(startedAt);
  const freshState = createInitialState(dailyMode ? dailyChallengeSeed(dailyDate) : crypto.getRandomValues(new Uint32Array(1))[0]!, startedAt);
  const initialState = dailyMode ? { ...freshState, plots: freshState.plots.slice(0, 4) } : freshState;
  let dailyBest = 0;
  try { dailyBest = readDailyBest(dailyDate); } catch { /* Private browsing can disable local storage. */ }
  let clockOffsetMs = 0;
  const simulationNowMs = () => Math.max(0, Date.now() - clockOffsetMs);
  let selectedSpeciesId: SpeciesId = 'sunny-sprout';
  let coins = initialState.coins;
  let latestSnapshot: GardenSnapshot = getSnapshot(initialState);
  const acceptPlotActivation = createPlotActivationGuard();
  let uiCommand: (command: Command) => void = () => {};
  let openLaboratory: () => void = () => {};
  let reportLabEvents: (events: readonly SimEvent[]) => void = () => {};
  const uiRoot = document.createElement('div');
  uiRoot.dataset.gardenUi = '';
  for (const [name, value] of Object.entries({
    '--mg-ui-panel': palette.ui.panel,
    '--mg-ui-border': palette.ui.border,
    '--mg-ui-text': palette.ui.text,
    '--mg-ui-accent': palette.ui.accent,
    '--mg-ui-accent-pressed': palette.ui['accent-pressed'],
    '--mg-ui-on-accent': palette.ui['text-on-accent'],
    '--mg-ui-misprint': palette.ui['misprint-shadow'],
    '--mg-ui-focus': palette.ui['focus-ring'],
    '--mg-ui-coin-face': palette.ui.coin.face,
    '--mg-ui-coin-rim': palette.ui.coin.rim,
    '--mg-ui-coin-emboss': palette.ui.coin.emboss,
    '--mg-ui-coin-outline': palette.ui.coin.outline,
    '--mg-ui-coin-text': palette.ui['coin-text'],
    '--mg-ui-panel-sunk': palette.ui['panel-sunk'],
    '--mg-ui-text-muted': palette.ui['text-muted'],
    '--mg-ui-success': palette.ui.success,
    '--mg-wood-light': palette.environment['wood-crate'][0],
    '--mg-wood-mid': palette.environment['wood-crate'][1],
    '--mg-wood-dark': palette.environment['wood-crate'][2],
    '--mg-glass-highlight': palette.environment.water[0],
  })) {
    uiRoot.style.setProperty(name, value);
  }
  for (const [id, plant] of Object.entries(palette.plants)) uiRoot.style.setProperty(`--mg-fruit-${id}`, plant.fruit[1]);
  document.body.append(uiRoot);
  // Set once saves load; the shop's Start over calls it.
  let resetGarden: () => Promise<void> = async () => {};
  const gardenUI = createGardenUI(uiRoot, {
    species: SPECIES
      .map(({ id, name, seedCost, unlockLevel }) => ({ id, name, cost: seedCost, unlockLevel, color: palette.plants[id].fruit[1], ...(id === 'prism-fig' || id === 'sunburst' ? { labSeed: true } : {}) })),
    journalTraits: [
      { id: 'giant', name: 'Giant', multiplier: MUTATIONS.giant.value, naturalChance: MUTATIONS.giant.naturalChance,
        rule: 'Water twice while the plant sprouts and grows.' },
      { id: 'golden', name: 'Golden', multiplier: MUTATIONS.golden.value, naturalChance: MUTATIONS.golden.naturalChance,
        rule: 'Keep two Sunny Sprout neighbours beside a growing plant.' },
      { id: 'glowing', name: 'Glowing', multiplier: MUTATIONS.glowing.value, naturalChance: MUTATIONS.glowing.naturalChance,
        rule: 'Keep a Puffcap beside a growing plant.', hintLevel: 4, prerequisite: 'Unlock Puffcap at Level 4 for the guaranteed recipe.' },
      { id: 'crystal', name: 'Crystal', multiplier: MUTATIONS.crystal.value, naturalChance: MUTATIONS.crystal.naturalChance,
        ruleOdds: '30% when the rule holds · Guaranteed after 40 qualifying Matures without Crystal.',
        rule: 'Harvest Glowing fruit from plot 0 or 2, then replant there.', prerequisites: ['glowing'],
        prerequisite: 'Find Glowing first to reveal the pond-side recipe.' },
      { id: 'rainbow', name: 'Rainbow', multiplier: MUTATIONS.rainbow.value, naturalChance: MUTATIONS.rainbow.naturalChance,
        rule: 'Harvest Golden, Glowing and Crystal together, then replant one of those plots.',
        prerequisites: ['golden', 'glowing', 'crystal'], prerequisite: 'Find Golden, Glowing and Crystal first.' },
      { id: 'frozen', name: 'Frozen', multiplier: MUTATIONS.frozen.value, naturalChance: MUTATIONS.frozen.naturalChance,
        rule: 'Keep a growing Dewbell beside this plant when it reaches Mature.', hintLevel: 13,
        prerequisite: 'Unlock Dewbell at Level 13 for the guaranteed recipe.' },
      { id: 'electric', name: 'Electric', multiplier: MUTATIONS.electric.value, naturalChance: MUTATIONS.electric.naturalChance,
        rule: 'Let Sprinkler II water this plant twice before it reaches Mature.', hintLevel: 7,
        prerequisite: 'Unlock Sprinkler II at Level 7 for the guaranteed recipe.' },
      { id: 'twin', name: 'Twin', multiplier: MUTATIONS.twin.value, naturalChance: MUTATIONS.twin.naturalChance,
        rule: 'Plant beside a mature Clockvine.', hintLevel: 11,
        prerequisite: 'Unlock Clockvine at Level 11 for the guaranteed recipe.' },
    ],
    selectedId: selectedSpeciesId,
    coins,
    onSelect: (speciesId) => {
      selectedSpeciesId = speciesId;
      refreshUI();
    },
    onToggleSound: () => changeSettings({ ...settings, sound: !settings.sound }),
    onToggleMusic: () => changeSettings({ ...settings, music: !settings.music }),
    onToggleHaptics: () => changeSettings({ ...settings, haptics: !settings.haptics }),
    onToggleLargeText: () => changeSettings({ ...settings, largeText: !settings.largeText }),
    onToggleDaily: () => {
      const url = new URL(location.href);
      if (dailyMode) url.searchParams.delete('daily'); else url.searchParams.set('daily', '');
      location.assign(url);
    },
    onHarvestAll: () => harvestAll(),
    onSell: () => uiCommand({ type: 'StartSelling' }),
    onOpenLab: () => openLaboratory(),
    onBuy: (item) => uiCommand({ type: 'Buy', item }),
    onReset: () => {
      if (dailyMode) {
        const url = new URL(location.href); url.searchParams.delete('daily'); location.assign(url);
        return;
      }
      if (!window.confirm('Start over? Your garden, coins and discoveries will be lost.')) return;
      void resetGarden();
    },
    onWaterAll: () => uiCommand({ type: 'WaterAll' }),
    onDismissHint: () => { if (!notices.current?.persistent) notices.close(); },
  });
  let harvestAll = () => {};
  let settings: Settings = DEFAULT_SETTINGS;
  let settingsChangedBeforeLoad = false;
  let notice = '';
  let noticeTimer = 0;
  // Input waits for the save to load, so a tap made while IndexedDB opens is not replaced by restore().
  let loadSettled = false;
  let reducedMotion = false;
  // ponytail: the HUD reads the latest snapshot each frame; hints are cheap pure functions of it.
  const refreshUI = () => {
    const snapshot = latestSnapshot;
    const span = Math.max(1, snapshot.nextLevelXp - snapshot.levelStartXp);
    gardenUI.update({
      selectedId: selectedSpeciesId,
      coins,
      bonusSeeds: snapshot.bonusSeeds ?? 0,
      labSeeds: snapshot.labSeeds ?? [],
      level: snapshot.level,
      levelProgress: (snapshot.xp - snapshot.levelStartXp) / span,
      hint: dailyMode ? notice || `Daily: sell the highest-value fruit. Back two beds are closed. Best sale: ${dailyBest}.` : notice || hintFor(snapshot, selectedSpeciesId),
      sound: settings.sound,
      music: settings.music,
      haptics: settings.haptics,
      largeText: settings.largeText,
      reducedMotion,
      ripeCount: snapshot.plots.filter(({ plant }) => plant?.stage === 'Harvestable').length,
      owned: snapshot.owned ?? [],
      fertiliser: snapshot.fertiliser ?? 0,
      crateCount: snapshot.crateCount ?? 0,
      crateCapacity: snapshot.crateCapacity ?? 12,
      selling: snapshot.selling ?? false,
      discoveries: snapshot.discoveries ?? [],
      dailyMode,
      dailyBest,
      naturalChanceBonus: snapshot.owned?.includes('lucky-charm') ? 0.03 : 0,
      opportunities: mutationOpportunitiesFor(snapshot),
      ...(snapshot.order ? { order: snapshot.order } : {}),
    });
  };
  const notices = createNoticeQueue((current) => {
    clearTimeout(noticeTimer);
    notice = current?.text ?? '';
    refreshUI();
    if (current && !current.persistent) noticeTimer = setTimeout(() => notices.close(), readingTimeMs(current.text)) as unknown as number;
  });
  const showNotice = (text: string, ms?: number) => {
    if (!text) { notices.resolve(notice); return; }
    notices.push({ text, persistent: ms === 0 || text.startsWith('Crate full.') });
  };
  let changeSettings: (next: Settings) => void = (next) => {
    settings = next;
    settingsChangedBeforeLoad = true;
    refreshUI();
  };

  let disposed = false;
  const disposeUI = () => {
    if (disposed) return;
    disposed = true;
    gardenUI.dispose();
    uiRoot.remove();
  };

  try {
    const r = createRenderer(canvas, {
      species: SPECIES.map((species) => ({
        id: species.id,
        stageFractions: [
          species.stages.find(({ stage }) => stage === 'Sprout')!.startsAtMs / species.growthDurationMs,
          species.stages.find(({ stage }) => stage === 'Growing')!.startsAtMs / species.growthDurationMs,
          species.stages.find(({ stage }) => stage === 'Mature')!.startsAtMs / species.growthDurationMs,
        ] as const,
      })),
    });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onResize = () => r.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();

    const sfx = createSfx();
    reducedMotion = motion.matches;
    const rewards = createRewardLayer(uiRoot, {
      projectPlot: r.projectPlot,
      projectStall: r.projectStall,
      coinTarget: () => uiRoot.querySelector<HTMLElement>('.garden-ui__coins'),
    });
    const mutationReveal = createMutationReveal(uiRoot, r.projectPlot);
    let cancelActiveGesture = () => {};
    // Audio may only start from a user gesture (autoplay rules).
    const unlockAudio = () => sfx.unlock();
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    let suspendedCommands: Command[] | null = null;
    const act = (command: Command) => {
      if (!loadSettled) return;
      if (suspendedCommands) suspendedCommands.push(command);
      else loop.enqueue(command);
    };
    uiCommand = act;
    const loop = createFixedStepLoop({
      initialState,
      nowMs: simulationNowMs,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      onRender: (frame) => {
        latestSnapshot = frame.current;
        if ((frame.current.crateCount ?? 0) < (frame.current.crateCapacity ?? 12)) notices.resolve('Crate full. Sell fruit at the stall to make room.');
        coins = frame.current.coins;
        reducedMotion = motion.matches;
        refreshUI();
        r.render(frame.previous, frame.current, frame.alpha, motion.matches);
      },
      onEvents: (events) => {
        reportLabEvents(events);
        scheduleSave(events);
        for (const event of events) {
          if (event.type === 'LevelUp') {
            const names = event.unlocked.map((id) => SPECIES.find((entry) => entry.id === id)!.name);
            gardenUI.levelUp(event.level, names, motion.matches);
          }
          if (event.type === 'Harvested') gardenUI.hideAway();
          if (settings.haptics && !motion.matches && (event.type === 'HarvestCompleted' || event.type === 'Mutated')) navigator.vibrate?.(event.type === 'Mutated' ? [12, 35, 18] : 12);
          if (event.type === 'OrderCompleted') showNotice(`Order complete. +${event.coins} coins, +${event.xp} XP.`);
          if (dailyMode && event.type === 'FruitSold') {
            try { dailyBest = recordDailyBest(dailyDate, event.value); } catch { /* The challenge works without local storage. */ }
            refreshUI();
          }
          if (event.type === 'CommandRejected' && event.reason === 'insufficient-coins') gardenUI.noCoins(motion.matches);
          if (event.type === 'CommandRejected' && event.reason === 'crate-full') {
            gardenUI.crateFull(motion.matches);
            showNotice('Crate full. Sell fruit at the stall to make room.', 0);
          }
        }
        r.onEvents(events, motion.matches);
        if (!motion.matches && events.some((event) => event.type === 'HarvestCompleted' && event.count >= 3)) r.nudge?.();
        rewards.onEvents(events, motion.matches);
        sfx.onEvents(events);
        for (const event of events.filter((item) => item.type === 'Mutated')
          .sort((a, b) => Number(b.mutations.includes('giant')) - Number(a.mutations.includes('giant')))) {
          const revealDiscovery = event.firstTraitDiscoveries.length > 0 || event.firstPairDiscoveries.length > 0;
          if (revealDiscovery) cancelActiveGesture();
          mutationReveal.show(event, motion.matches);
          if (revealDiscovery && !motion.matches) {
            uiRoot.querySelector('.garden-ui__journal')?.animate([
              { transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' },
            ], { duration: 420 });
          }
          sfx.mutation(event.mutations, revealDiscovery);
          if (revealDiscovery && settings.haptics && !motion.matches) navigator.vibrate?.([20, 40, 20]);
        }
        if (settings.haptics && !motion.matches && 'vibrate' in navigator) {
          if (events.some(({ type }) => type === 'Harvested')) navigator.vibrate?.(15);
          else if (events.some(({ type }) => type === 'Planted')) navigator.vibrate?.(10);
        }
      },
    });
    const input = createPointerInput(canvas, r.pick, (intent) => {
      switch (intent.type) {
        case 'ZoomCamera':
          r.zoom(intent.scale);
          return;
        case 'PanCamera':
          r.pan(intent.deltaXCss, intent.deltaYCss);
          return;
        case 'Sell':
          act({ type: 'StartSelling' });
          return;
        case 'ActivatePlot': {
          const command = commandForPlotActivation(latestSnapshot, intent.plotId, selectedSpeciesId);
          if (command && acceptPlotActivation(command, Date.now())) act(command);
          return;
        }
        case 'HarvestPlots': {
          const command = commandForSwipeHarvest(latestSnapshot, intent.plotIds);
          if (command && acceptPlotActivation(command, Date.now())) act(command);
          return;
        }
        default: {
          const exhaustive: never = intent;
          return exhaustive;
        }
      }
    });
    let labDispose: (() => void) | null = null;
    let labOpening = false;
    openLaboratory = () => {
      if (labDispose || labOpening) return;
      labOpening = true;
      void import('../lab/laboratory').then(({ createLaboratory }) => {
        labOpening = false;
        if (disposed || labDispose) return;
        const lab = createLaboratory(uiRoot, {
          getState: () => loop.getState(),
          store: (crateIndex, expectedFruit) => act({ type: 'StoreLabSpecimen', crateIndex, expectedFruit }),
          merge: (specimenIds) => act({ type: 'MergeLabSpecimens', specimenIds }),
          returnToCrate: (specimenIds) => act({ type: 'ReturnLabSpecimens', specimenIds }),
          close: () => { labDispose?.(); labDispose = null; },
        });
        labDispose = () => { lab(); reportLabEvents = () => {}; labDispose = null; };
        reportLabEvents = lab.report;
      }).catch(() => { labOpening = false; showNotice('The laboratory could not be opened. Your garden is safe.'); });
    };
    cancelActiveGesture = input.cancelGesture;
    harvestAll = () => {
      const ripe = latestSnapshot.plots.filter(({ plant }) => plant?.stage === 'Harvestable').map(({ id }) => id);
      const command = commandForSwipeHarvest(latestSnapshot, ripe);
      if (command && acceptPlotActivation(command, Date.now())) act(command);
    };
    let resumedAway: ReturnType<typeof advanceOffline> | null = null;
    const lifecycle = createPageLifecycle({
      loop,
      isHidden: () => document.hidden,
      subscribeVisibility: (listener) => {
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
      },
      subscribePageHide: (listener) => {
        window.addEventListener('pagehide', listener);
        return () => window.removeEventListener('pagehide', listener);
      },
      subscribePageShow: (listener) => {
        window.addEventListener('pageshow', listener);
        return () => window.removeEventListener('pageshow', listener);
      },
      cancelGesture: input.cancelGesture,
      beforeSuspend: () => {
        suspendedCommands = [];
        loop.catchUp();
      },
      beforeResume: () => {
        const state = loop.getState();
        const wallNowMs = Date.now();
        clockOffsetMs = capClockOffset(clockOffsetMs, state.lastNowMs, wallNowMs);
        resumedAway = advanceOffline(state, state.lastNowMs, Math.max(0, wallNowMs - clockOffsetMs));
        if (resumedAway) {
          loop.restore(resumedAway.state);
          for (const command of suspendedCommands ?? []) loop.enqueue(command);
          loop.reportEvents?.(resumedAway.events.filter((event) =>
            event.type === 'Mutated' || event.type === 'LevelUp' || event.type === 'OrderCompleted'));
        }
      },
      afterResume: () => {
        if (resumedAway) {
          showAwaySummary(resumedAway);
        }
        suspendedCommands = null;
        resumedAway = null;
      },
    });
    // Saves (docs/architecture.md, Saves): load once, then write after changes, every 10 s and on hide.
    const savesReady = chooseBackend().then(async ({ backend, persistent }) => {
      const store = createSaveStore(backend, import.meta.env.MODE, () => Date.now());
      const storedSettings = await store.loadSettings();
      if (!settingsChangedBeforeLoad) settings = storedSettings;
      else void store.saveSettings(settings);
      sfx.setMuted(!settings.sound);
      sfx.setMusic(settings.music);
      changeSettings = (next) => {
        settings = next;
        sfx.setMuted(!next.sound);
        sfx.setMusic(next.music);
        refreshUI();
        void store.saveSettings(next);
      };
      if (dailyMode) return;
      const loaded = await store.load();
      if (loaded.kind === 'newer') {
        // Leave the newer save alone: playing here would overwrite it with older progress.
        showNotice('This save is from a newer version. Reload the page to update. Progress here will not be saved.');
        return;
      }
      let pending = 0;
      let failures = 0;
      let stopped = false;
      if (loaded.kind !== 'empty' && loaded.state) {
        const loadedAt = Date.now();
        const offline = advanceOffline(loaded.state, loaded.savedAt, loadedAt);
        clockOffsetMs = Math.max(0, loadedAt - offline.state.lastNowMs);
        loop.restore(offline.state);
        latestSnapshot = getSnapshot(offline.state);
        coins = latestSnapshot.coins;
        if (offline.elapsedMs > 0) {
          try {
            await store.save(offline.state, loadedAt);
          } catch (error) {
            if (error instanceof StaleSaveError) {
              stopped = true;
              showNotice('This garden was opened in another tab. Reload to keep playing here.', 0);
            } else {
              failures = 3;
              showNotice('Progress is not saving. Free some storage space, then reload.', 0);
            }
          }
        }
        loop.reportEvents?.(offline.events.filter((event) =>
          event.type === 'Mutated' || event.type === 'LevelUp' || event.type === 'OrderCompleted'));
        // Present the advanced garden after loading and attempting to persist it.
        refreshUI();
        showAwaySummary(offline);
      }
      if (loaded.kind === 'recovered') {
        showNotice(loaded.state ? 'Your last save was damaged. The backup was loaded.' : 'Your save could not be read. It was kept aside.');
      } else if (!persistent) {
        showNotice('This browser cannot save. Progress lasts until you close the page.');
      }
      resetGarden = async () => {
        stopped = true;
        clearTimeout(pending);
        await store.reset();
        window.location.reload();
      };
      saveNow = () => {
        clearTimeout(pending);
        if (stopped) return;
        store.save(loop.getState(), Date.now()).then(() => {
          if (failures >= 3) showNotice('');
          failures = 0;
        }, (error: unknown) => {
          if (error instanceof StaleSaveError) {
            stopped = true;
            showNotice('This garden was opened in another tab. Reload to keep playing here.', 0);
            return;
          }
          failures += 1;
          // Stays up until a save lands again.
          if (failures >= 3) showNotice('Progress is not saving. Free some storage space, then reload.', 0);
        });
      };
      scheduleSave = (events) => {
        if (!events.some(({ type }) => type === 'Planted' || type === 'Harvested' || type === 'Watered' || type === 'FruitSold'
          || type === 'Mutated' || type === 'Bought' || type === 'OrderCompleted' || type === 'LabSpecimenStored' || type === 'LabMergeCompleted')) return;
        clearTimeout(pending);
        pending = setTimeout(saveNow, 800) as unknown as number;
      };
      // Hidden tabs skip the timed save, so an idle tab never writes over the one being played.
      saveTimer = setInterval(() => { if (!document.hidden) saveNow(); }, 10_000) as unknown as number;
    }).catch((error: unknown) => {
      // Don't save over a garden we could not read; say so instead of resetting quietly.
      console.warn('Save load failed', error);
      showNotice('Your save could not be loaded. Reload the page to try again. Progress here will not be saved.', 0);
    }).finally(() => { loadSettled = true; });
    let saveNow = () => {};
    let scheduleSave: (events: readonly SimEvent[]) => void = () => {};
    let saveTimer = 0;
    const onHide = () => { if (document.hidden) saveNow(); };
    const onPageHide = () => saveNow();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    function showAwaySummary(offline: ReturnType<typeof advanceOffline>): void {
      if (offline.elapsedMs < 30_000) return;
      gardenUI.showAway({
        plantsGrown: offline.plantsGrown,
        plotsWatered: offline.plotsWatered,
        fruitHarvested: offline.fruitHarvested,
        coinsSold: offline.coinsSold,
        crateContents: offline.crateContents.map(({ speciesId, count }) =>
          `${SPECIES.find(({ id }) => id === speciesId)!.name} × ${count}`).join(', '),
        ripeCount: offline.ripePlotIds.length,
      }, () => {
        const command = commandForSwipeHarvest(latestSnapshot, offline.ripePlotIds);
        if (command && acceptPlotActivation(command, Date.now())) act(command);
      });
    }

    lifecycle.start();
    document.body.dataset.boot = 'webgl';
    void Promise.all([r.whenLoaded(), savesReady]).then(() => {
      if (!disposed) document.body.dataset.models = 'ready';
    });
    return () => {
      if (disposed) return;
      disposed = true;
      lifecycle.dispose();
      input.dispose();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(saveTimer);
      saveNow();
      rewards.dispose();
      labDispose?.();
      mutationReveal.dispose();
      sfx.dispose();
      r.dispose();
      gardenUI.dispose();
      uiRoot.remove();
    };
  } catch {
    // WebGL unavailable: the page still loads; M1 adds a proper fallback message.
    document.body.dataset.boot = 'no-webgl';
    return disposeUI;
  }
}
