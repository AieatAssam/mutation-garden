import { SHOP_PRICES, SELLING_UPGRADES, AUTOMATION_UPGRADES, type ShopItemId, type SpeciesId, type TraitId } from '../sim';
import './garden-ui.css';
import { readingTimeMs } from './notice-queue';
import { createDiscoveryJournal, type JournalOrder, type JournalTraitDescriptor } from './discovery-journal';

export interface SeedDescriptor {
  readonly id: SpeciesId;
  readonly name: string;
  readonly cost: number;
  readonly unlockLevel: number;
  /** The fruit colour shown on the seed card (a palette value). */
  readonly color?: string;
  readonly labSeed?: boolean;
}

export interface GardenUIOptions {
  readonly species: readonly SeedDescriptor[];
  readonly journalTraits?: readonly JournalTraitDescriptor[];
  readonly selectedId: SpeciesId;
  readonly coins: number;
  readonly onSelect: (speciesId: SpeciesId) => void;
  readonly onToggleSound?: () => void;
  readonly onToggleMusic?: () => void;
  readonly onToggleHaptics?: () => void;
  readonly onToggleLargeText?: () => void;
  readonly onToggleDaily?: () => void;
  readonly onHarvestAll?: () => void;
  readonly onSell?: () => void;
  readonly onBuy?: (item: ShopItemId) => void;
  /** Wipes the save after the player confirms; the app reloads into a new garden. */
  readonly onReset?: () => void;
  readonly onWaterAll?: () => void;
  readonly onDismissHint?: () => void;
  readonly onOpenLab?: () => void;
}

export interface GardenUIUpdate {
  readonly selectedId: SpeciesId;
  readonly coins: number;
  readonly bonusSeeds?: number;
  readonly labSeeds?: readonly SpeciesId[];
  readonly level?: number;
  /** 0..1 progress through the current level. */
  readonly levelProgress?: number;
  /** One short line telling the player what to do next. Empty hides it. */
  readonly hint?: string;
  readonly sound?: boolean;
  readonly music?: boolean;
  readonly haptics?: boolean;
  readonly largeText?: boolean;
  readonly reducedMotion?: boolean;
  /** Ripe plants right now; two or more show the Harvest all button. */
  readonly ripeCount?: number;
  readonly owned?: readonly ShopItemId[];
  readonly fertiliser?: number;
  readonly crateCount?: number;
  readonly crateCapacity?: number;
  readonly selling?: boolean;
  readonly discoveries?: readonly string[];
  readonly naturalChanceBonus?: number;
  readonly opportunities?: Partial<Record<TraitId, readonly string[]>>;
  readonly order?: JournalOrder;
  readonly dailyMode?: boolean;
  readonly dailyBest?: number;
}

export interface AwaySummary {
  readonly plantsGrown: number;
  readonly plotsWatered: number;
  readonly fruitHarvested: number;
  readonly coinsSold: number;
  readonly crateContents: string;
  readonly ripeCount: number;
}

export interface GardenUI {
  update(update: GardenUIUpdate): void;
  /** Stamps the new level and names what it unlocked (motion.md 4.7). */
  levelUp(level: number, unlocked: readonly string[], reducedMotion: boolean): void;
  /** "While you were away" card with a one-tap harvest of everything ripe. */
  showAway(summary: AwaySummary, onHarvestAll: () => void): void;
  hideAway(): void;
  /** Nudges the coin chip when a seed costs more than the player has. */
  noCoins(reducedMotion: boolean): void;
  crateFull(reducedMotion: boolean): void;
  dispose(): void;
}

const SVG = 'http://www.w3.org/2000/svg';

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('garden-ui__icon');
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Mount the app's HUD into an owned overlay container. */
export function createGardenUI(container: HTMLElement, options: GardenUIOptions): GardenUI {
  const overlay = document.createElement('div');
  overlay.className = 'garden-ui';

  const coinStatus = document.createElement('div');
  coinStatus.className = 'garden-ui__coins';
  coinStatus.setAttribute('role', 'status');
  coinStatus.setAttribute('aria-label', 'Coins');

  const coinToken = document.createElement('span');
  coinToken.className = 'garden-ui__coin-token';
  coinToken.setAttribute('aria-hidden', 'true');
  const coinMark = document.createElementNS(SVG, 'svg');
  coinMark.classList.add('garden-ui__coin-mark');
  coinMark.setAttribute('viewBox', '0 0 40 40');
  coinMark.setAttribute('focusable', 'false');
  const rim = document.createElementNS(SVG, 'path');
  rim.classList.add('garden-ui__coin-ridges');
  rim.setAttribute('d', 'M20 2v4 M26.9 3.2l-1.4 3.8 M33 7l-2.8 2.8 M36.8 13.1 33 14.5 M38 20h-4 M36.8 26.9 33 25.5 M33 33l-2.8-2.8 M26.9 36.8l-1.4-3.8 M20 38v-4 M13.1 36.8l1.4-3.8 M7 33l2.8-2.8 M3.2 26.9 7 25.5 M2 20h4 M3.2 13.1 7 14.5 M7 7l2.8 2.8 M13.1 3.2l1.4 3.8');
  const innerRing = document.createElementNS(SVG, 'circle');
  innerRing.classList.add('garden-ui__coin-inner-ring');
  innerRing.setAttribute('cx', '20');
  innerRing.setAttribute('cy', '20');
  innerRing.setAttribute('r', '10');
  const seed = document.createElementNS(SVG, 'path');
  seed.classList.add('garden-ui__coin-seed');
  seed.setAttribute('d', 'M17 23c-2.4-2.3-1.1-6.2 3-6.8 2.1 2.1 2.1 5.2-3 6.8Zm3-1.8c0-3 1.4-5 4-6');
  coinMark.append(rim, innerRing, seed);
  coinToken.append(coinMark);
  const coinAmount = document.createElement('span');
  coinAmount.className = 'garden-ui__coin-amount';
  const crateAmount = document.createElement('span');
  crateAmount.className = 'garden-ui__crate-amount';
  crateAmount.setAttribute('role', 'status');
  crateAmount.setAttribute('aria-label', 'Crate');
  coinStatus.append(coinToken, coinAmount);

  // Top card: level, progress and the current objective (brief section 8; prototype title card).
  const levelBadge = document.createElement('div');
  levelBadge.className = 'garden-ui__card';
  const levelText = document.createElement('strong');
  levelText.className = 'garden-ui__level-text';
  const levelBar = document.createElement('span');
  levelBar.className = 'garden-ui__level-bar';
  levelBar.setAttribute('role', 'progressbar');
  levelBar.setAttribute('aria-label', 'Level progress');
  levelBar.setAttribute('aria-valuemin', '0');
  levelBar.setAttribute('aria-valuemax', '100');
  const levelFill = document.createElement('span');
  levelFill.className = 'garden-ui__level-fill';
  levelBar.append(levelFill);
  levelBadge.append(levelText, levelBar);

  const toggles = document.createElement('div');
  toggles.className = 'garden-ui__toggles';
  const toggle = (label: string, paths: readonly string[], onClick?: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garden-ui__toggle';
    button.setAttribute('aria-label', label);
    button.append(icon(paths));
    button.addEventListener('click', () => onClick?.());
    toggles.append(button);
    return button;
  };
  const soundButton = toggle('Sound', ['M4 9h4l5-4v14l-5-4H4Z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'], options.onToggleSound);
  const musicButton = toggle('Music', ['M9 18V6l10-2v12', 'M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z', 'M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z'], options.onToggleMusic);
  const hapticsButton = toggle('Haptics', ['M8 4v16 M12 2v20 M16 4v16'], options.onToggleHaptics);
  const largeTextButton = toggle('Large text', ['M3 6h18 M12 6v14 M7 20h10'], options.onToggleLargeText);
  const dailyButton = document.createElement('button');
  dailyButton.type = 'button';
  dailyButton.className = 'garden-ui__daily';
  dailyButton.addEventListener('click', () => options.onToggleDaily?.());
  const photoButton = toggle('Photo mode', ['M4 7h3l2-2h6l2 2h3v12H4Z', 'M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z']);
  photoButton.classList.add('garden-ui__photo-toggle');
  photoButton.addEventListener('click', () => {
    const active = overlay.classList.toggle('garden-ui--photo-mode');
    photoButton.setAttribute('aria-pressed', String(active));
    photoButton.setAttribute('aria-label', active ? 'Exit photo mode' : 'Photo mode');
  });
  const shopButton = document.createElement('button');
  shopButton.type = 'button'; shopButton.className = 'garden-ui__shop'; shopButton.setAttribute('aria-label', 'Shop');
  shopButton.innerHTML = '<span aria-hidden="true">▣</span> Shop';
  const shop = document.createElement('div'); shop.className = 'garden-ui__shop-backdrop'; shop.hidden = true;
  const sheet = document.createElement('section'); sheet.className = 'garden-ui__shop-sheet'; sheet.setAttribute('aria-label', 'Shop');
  const shopHead = document.createElement('header'); shopHead.innerHTML = '<strong>Shop</strong>';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'garden-ui__shop-close'; close.textContent = 'Close';
  shopHead.append(close); sheet.append(shopHead);
  const shopItems: readonly { id: ShopItemId; title: string; desc: string; price: number; level: number; requires?: ShopItemId }[] = [
    { id: 'plot-6', title: 'Plot 7', desc: 'Grow the island west.', price: SHOP_PRICES['plot-6'], level: 3 },
    { id: 'plot-7', title: 'Plot 8', desc: 'Add another garden bed.', price: SHOP_PRICES['plot-7'], level: 4 },
    { id: 'big-can', title: 'Big can', desc: 'Tap once to water every growing plant.', price: SHOP_PRICES['big-can'], level: 3 },
    { id: 'fertiliser', title: 'Fertiliser', desc: 'Next seed grows 40% faster.', price: SHOP_PRICES.fertiliser, level: 1 },
    { id: 'lucky-charm', title: 'Lucky charm', desc: '+3% natural mutation chance.', price: SHOP_PRICES['lucky-charm'], level: 5 },
    ...SELLING_UPGRADES,
    ...AUTOMATION_UPGRADES,
  ];
  const shopRows = shopItems.map((item) => {
    const row = document.createElement('article'); row.className = 'garden-ui__shop-row';
    const copy = document.createElement('div'); copy.innerHTML = `<strong>${item.title}</strong><span>${item.desc}</span><span>Level ${item.level} · ${item.price} coins</span>`;
    const action = document.createElement('button'); action.type = 'button'; action.className = 'garden-ui__buy';
    action.addEventListener('click', () => options.onBuy?.(item.id));
    row.append(copy, action); sheet.append(row); return { item, row, action };
  });
  const bigCan = document.createElement('button'); bigCan.type = 'button'; bigCan.className = 'garden-ui__water-all'; bigCan.textContent = 'Water all'; bigCan.hidden = true;
  bigCan.addEventListener('click', () => options.onWaterAll?.());
  close.addEventListener('click', () => { shop.hidden = true; });
  shopButton.addEventListener('click', () => { journal.close(); sheet.scrollTop = 0; shop.hidden = false; });
  shop.addEventListener('click', (event) => { if (event.target === shop) shop.hidden = true; });
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'garden-ui__reset';
  reset.textContent = 'Start over';
  reset.addEventListener('click', () => options.onReset?.());
  sheet.append(reset);
  shop.append(sheet); overlay.append(shop, bigCan);

  // The objective line shows only while there is something to say, so it rarely covers the garden.
  const hint = document.createElement('p');
  hint.className = 'garden-ui__hint';
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  hint.addEventListener('click', () => options.onDismissHint?.());
  hint.style.pointerEvents = 'auto';

  const harvestAll = document.createElement('button');
  harvestAll.type = 'button';
  harvestAll.className = 'garden-ui__harvest-all';
  harvestAll.hidden = true;
  harvestAll.addEventListener('click', () => options.onHarvestAll?.());
  const sell = document.createElement('button');
  sell.type = 'button';
  sell.className = 'garden-ui__sell';
  sell.addEventListener('click', () => options.onSell?.());

  const seedTray = document.createElement('nav');
  seedTray.className = 'garden-ui__tray';
  seedTray.setAttribute('aria-label', 'Seeds');
  const trayLabel = document.createElement('span');
  trayLabel.className = 'garden-ui__tray-label';
  trayLabel.textContent = 'Seeds';
  const seedScroll = document.createElement('div');
  seedScroll.className = 'garden-ui__seeds';
  const seedButtons = options.species.map((species) => {
    const button = document.createElement('button');
    button.className = 'garden-ui__seed';
    button.type = 'button';
    const swatch = document.createElement('span');
    swatch.className = 'garden-ui__seed-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    if (species.color) swatch.style.setProperty('--seed-color', species.color);
    const name = document.createElement('span');
    name.className = 'garden-ui__seed-name';
    name.textContent = species.name;
    const detail = document.createElement('span');
    detail.className = 'garden-ui__seed-detail';
    // Prices use the same Seed Token as the coin counter, just smaller (style guide 6).
    const priceCoin = coinToken.cloneNode(true) as HTMLElement;
    priceCoin.classList.add('garden-ui__coin-token--small');
    const detailText = document.createElement('span');
    detail.append(priceCoin, detailText);
    button.append(swatch, name, detail);
    button.dataset.speciesId = species.id;
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') options.onSelect(species.id);
    });
    button.addEventListener('focus', () => {
      if (button.matches(':focus-visible')) button.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    seedScroll.append(button);
    return { species, button, detail: detailText, locked: null as boolean | null };
  });
  seedTray.prepend(trayLabel);
  seedTray.append(seedScroll);
  const journal = createDiscoveryJournal(overlay, {
    species: options.species,
    traits: options.journalTraits ?? [],
    onOpen: () => { shop.hidden = true; },
  });

  const stamp = document.createElement('div');
  stamp.className = 'garden-ui__stamp';
  stamp.setAttribute('role', 'status');
  stamp.hidden = true;
  stamp.addEventListener('click', () => { clearTimeout(stampTimer); stamp.hidden = true; });

  const away = document.createElement('div');
  away.className = 'garden-ui__away';
  away.setAttribute('role', 'status');
  away.setAttribute('aria-label', 'While you were away');
  away.setAttribute('aria-live', 'polite');
  away.hidden = true;
  const awayText = document.createElement('p');
  const awayButton = document.createElement('button');
  awayButton.type = 'button';
  awayButton.className = 'garden-ui__away-button';
  awayButton.textContent = 'Harvest all';
  const awayClose = document.createElement('button');
  awayClose.type = 'button';
  awayClose.className = 'garden-ui__away-close';
  awayClose.setAttribute('aria-label', 'Close return summary');
  awayClose.textContent = '×';
  const awayActions = document.createElement('div');
  awayActions.className = 'garden-ui__away-actions';
  awayActions.append(awayButton, awayClose);
  away.append(awayText, awayActions);
  away.addEventListener('click', (event) => { if (event.target === away) away.hidden = true; });
  let onAwayHarvest: (() => void) | null = null;
  awayButton.addEventListener('click', () => {
    onAwayHarvest?.();
    away.hidden = true;
  });
  awayClose.addEventListener('click', () => { away.hidden = true; });

  overlay.append(coinStatus, crateAmount, levelBadge, toggles, hint, stamp, away, seedTray);
  seedTray.append(harvestAll, sell);
  // Main actions live in the bottom third (AGENTS.md): Shop is a tab on the seed tray.
  const trayTools = document.createElement('div');
  trayTools.className = 'garden-ui__tray-tools';
  const labButton = document.createElement('button');
  labButton.type = 'button'; labButton.className = 'garden-ui__shop'; labButton.textContent = 'Lab';
  labButton.setAttribute('aria-label', 'Open laboratory');
  labButton.addEventListener('click', () => options.onOpenLab?.());
  trayTools.append(dailyButton, journal.button, shopButton, labButton);
  seedTray.append(trayTools);
  container.append(overlay);

  // The counter rolls toward the authoritative value with an overshoot ease (motion.md 7).
  let shownCoins = options.coins;
  let targetCoins = options.coins;
  let rollFrom = options.coins;
  let rollStart = 0;
  let rollFrame = 0;
  let instant = false;
  const ease = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  const roll = (now: number) => {
    const t = Math.min(1, (now - rollStart) / 400);
    shownCoins = Math.round(rollFrom + (targetCoins - rollFrom) * ease(t));
    coinAmount.textContent = String(t >= 1 ? targetCoins : shownCoins);
    rollFrame = t < 1 ? requestAnimationFrame(roll) : 0;
  };

  const update = (state: GardenUIUpdate) => {
    instant = state.reducedMotion ?? instant;
    if (state.coins !== targetCoins) {
      targetCoins = state.coins;
      if (instant || typeof requestAnimationFrame === 'undefined') {
        coinAmount.textContent = String(targetCoins);
      } else {
        rollFrom = shownCoins;
        rollStart = performance.now();
        if (!rollFrame) rollFrame = requestAnimationFrame(roll);
      }
    } else if (!rollFrame) {
      coinAmount.textContent = String(targetCoins);
    }
    const level = state.level ?? 1;
    labButton.hidden = level < 18;
    levelText.textContent = `Level ${level}`;
    const progress = Math.round(Math.min(1, Math.max(0, state.levelProgress ?? 0)) * 100);
    levelFill.style.width = `${progress}%`;
    levelBar.setAttribute('aria-valuenow', String(progress));
    const visibleHint = state.dailyMode && !state.hint ? 'Daily challenge: sell your most valuable fruit.' : state.hint;
    hint.textContent = visibleHint ?? '';
    hint.hidden = !visibleHint;
    // Objectives fit one line; rare long notices (saves) wrap so nothing is cut off.
    hint.classList.toggle('is-long', !state.dailyMode && (visibleHint ?? '').length > 40);
    hint.classList.toggle('is-daily', Boolean(state.dailyMode));
    const ripe = state.ripeCount ?? 0;
    const crateCount = state.crateCount ?? 0;
    const crateCapacity = state.crateCapacity ?? 12;
    crateAmount.textContent = `${crateCount >= crateCapacity ? '▣ ' : ''}${crateCount}/${crateCapacity}`;
    sell.hidden = crateCount === 0 || !options.onSell;
    sell.disabled = crateCount === 0;
    sell.textContent = state.selling ? 'Selling' : 'Sell';
    harvestAll.hidden = ripe < 2 || !options.onHarvestAll;
    harvestAll.textContent = `Harvest all ${ripe}`;
    soundButton.setAttribute('aria-pressed', String(state.sound ?? true));
    musicButton.setAttribute('aria-pressed', String(state.music ?? true));
    hapticsButton.setAttribute('aria-pressed', String(state.haptics ?? false));
    largeTextButton.setAttribute('aria-pressed', String(state.largeText ?? false));
    dailyButton.setAttribute('aria-label', state.dailyMode
      ? `Exit daily garden. Sell the highest-value fruit. Back two beds unavailable. Best sale today: ${state.dailyBest ?? 0}.`
      : `Daily garden. Back two beds unavailable. Best sale today: ${state.dailyBest ?? 0}.`);
    dailyButton.title = `Sell the highest-value fruit. The back two beds are closed. Best sale today: ${state.dailyBest ?? 0}.`;
    dailyButton.textContent = state.dailyMode ? 'Exit daily' : `Daily ${state.dailyBest ?? 0}`;
    document.documentElement.classList.toggle('garden-large-text', state.largeText ?? false);
    const owned = state.owned ?? [];
    trayLabel.textContent = state.fertiliser ? `Fert x${state.fertiliser}` : state.bonusSeeds ? `Free x${state.bonusSeeds}` : 'Seeds';
    trayLabel.title = state.fertiliser ? `Seeds · Fertiliser x${state.fertiliser}` : state.bonusSeeds ? `Seeds · Lantern Pod x${state.bonusSeeds} free` : 'Seeds';
    bigCan.hidden = !owned.includes('big-can');
    bigCan.textContent = `Water all${state.fertiliser ? ` · Fertiliser x${state.fertiliser}` : ''}`;
    for (const { item, row, action } of shopRows) {
      const has = owned.includes(item.id);
      const locked = level < item.level || Boolean(item.requires && !owned.includes(item.requires));
      const affordable = state.coins >= item.price;
      row.classList.toggle('is-muted', locked || !affordable);
      action.disabled = (has && item.id !== 'fertiliser') || locked || !affordable || Boolean(state.dailyMode && (item.id === 'plot-6' || item.id === 'plot-7'));
      const requiredTitle = shopItems.find(({ id }) => id === item.requires)?.title;
      action.textContent = has && item.id !== 'fertiliser' ? 'Owned' : item.id === 'fertiliser' && (state.fertiliser ?? 0) > 0 ? 'Add one' : locked ? item.requires && !owned.includes(item.requires) ? `Requires ${requiredTitle}` : `Level ${item.level}` : `Buy · ${item.price}`;
    }
    journal.update({
      discoveries: state.discoveries ?? [],
      level,
      ...(state.naturalChanceBonus === undefined ? {} : { naturalChanceBonus: state.naturalChanceBonus }),
      ...(state.opportunities === undefined ? {} : { opportunities: state.opportunities }),
      ...(state.order === undefined ? {} : { order: state.order }),
    });
    for (const seed of seedButtons) {
      const selected = seed.species.id === state.selectedId;
      const hasLabSeed = (state.labSeeds ?? []).includes(seed.species.id);
      const locked = seed.species.labSeed ? !hasLabSeed : seed.species.unlockLevel > level;
      seed.button.hidden = Boolean(seed.species.labSeed && !hasLabSeed);
      seed.button.setAttribute('aria-pressed', String(selected));
      seed.button.classList.toggle('is-selected', selected);
      // Unlocked but unaffordable: still selectable, but the price reads as out of reach.
      const bonusLantern = seed.species.id === 'lantern-pod' && (state.bonusSeeds ?? 0) > 0;
      seed.button.classList.toggle('is-short', !locked && !bonusLantern && state.coins < seed.species.cost);
      if (seed.locked !== locked) {
        seed.button.setAttribute('aria-disabled', String(locked));
        seed.button.classList.toggle('is-locked', locked);
        seed.locked = locked;
      }
      seed.detail.textContent = seed.species.labSeed && hasLabSeed ? 'Lab seed' : locked ? `Level ${seed.species.unlockLevel}` : bonusLantern ? '1 free seed' : `${seed.species.cost} ${seed.species.cost === 1 ? 'coin' : 'coins'}`;
    }
  };
  update(options);

  let stampTimer = 0;
  let disposed = false;
  return {
    update,
    levelUp(level, unlocked, reducedMotion) {
      stamp.textContent = '';
      const title = document.createElement('strong');
      title.textContent = `Level ${level}`;
      stamp.append(title);
      if (unlocked.length > 0) {
        const detail = document.createElement('span');
        detail.textContent = `New seed: ${unlocked.join(', ')}`;
        stamp.append(detail);
      }
      stamp.hidden = false;
      stamp.animate(reducedMotion
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
          { opacity: 0, transform: 'translate(-50%, 0) scale(2.2) rotate(-8deg)' },
          { opacity: 1, transform: 'translate(-50%, 0) scale(0.92) rotate(-3deg)', offset: 0.55 },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1) rotate(-3deg)' },
        ], { duration: reducedMotion ? 150 : 420, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', fill: 'forwards' });
      for (const seed of seedButtons) {
        if (seed.species.unlockLevel === level && !reducedMotion) {
          seed.button.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420, delay: 500 });
        }
      }
      clearTimeout(stampTimer);
      stampTimer = window.setTimeout(() => { stamp.hidden = true; }, readingTimeMs(stamp.textContent ?? ''));
    },
    showAway(summary, onHarvestAll) {
      awayText.textContent = `While you were away\nPlants grown: ${summary.plantsGrown} · Plots watered: ${summary.plotsWatered}\nFruit harvested: ${summary.fruitHarvested} · Coins sold: ${summary.coinsSold}\nCrate: ${summary.crateContents || 'empty'}`;
      onAwayHarvest = onHarvestAll;
      awayButton.hidden = summary.ripeCount === 0;
      away.hidden = false;
    },
    noCoins(reducedMotion) {
      coinStatus.classList.remove('is-short', 'is-short-still');
      void coinStatus.offsetWidth;
      coinStatus.classList.add(reducedMotion ? 'is-short-still' : 'is-short');
    },
    crateFull(reducedMotion) {
      crateAmount.classList.remove('is-shaking');
      if (reducedMotion) return;
      void crateAmount.offsetWidth;
      crateAmount.classList.add('is-shaking');
      crateAmount.animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(-5px)', offset: 0.15 },
        { transform: 'translateX(5px)', offset: 0.3 }, { transform: 'translateX(-4px)', offset: 0.5 },
        { transform: 'translateX(2px)', offset: 0.75 }, { transform: 'translateX(0)' },
      ], { duration: 300, easing: 'ease-out' }).onfinish = () => crateAmount.classList.remove('is-shaking');
    },
    hideAway() {
      away.hidden = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (rollFrame) cancelAnimationFrame(rollFrame);
      clearTimeout(stampTimer);
      journal.dispose();
      overlay.remove();
    },
  };
}
