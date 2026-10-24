import { SHOP_PRICES, type ShopItemId, type SpeciesId } from '../sim';
import './garden-ui.css';
import { readingTimeMs } from './notice-queue';

export interface SeedDescriptor {
  readonly id: SpeciesId;
  readonly name: string;
  readonly cost: number;
  readonly unlockLevel: number;
  /** The fruit colour shown on the seed card (a palette value). */
  readonly color?: string;
}

export interface GardenUIOptions {
  readonly species: readonly SeedDescriptor[];
  readonly selectedId: SpeciesId;
  readonly coins: number;
  readonly onSelect: (speciesId: SpeciesId) => void;
  readonly onToggleSound?: () => void;
  readonly onToggleMusic?: () => void;
  readonly onHarvestAll?: () => void;
  readonly onSell?: () => void;
  readonly onBuy?: (item: ShopItemId) => void;
  readonly onWaterAll?: () => void;
  readonly onDismissHint?: () => void;
}

export interface GardenUIUpdate {
  readonly selectedId: SpeciesId;
  readonly coins: number;
  readonly level?: number;
  /** 0..1 progress through the current level. */
  readonly levelProgress?: number;
  /** One short line telling the player what to do next. Empty hides it. */
  readonly hint?: string;
  readonly sound?: boolean;
  readonly music?: boolean;
  readonly reducedMotion?: boolean;
  /** Ripe plants right now; two or more show the Harvest all button. */
  readonly ripeCount?: number;
  readonly owned?: readonly ShopItemId[];
  readonly fertiliser?: number;
  readonly crateCount?: number;
  readonly crateCapacity?: number;
  readonly selling?: boolean;
}

export interface GardenUI {
  update(update: GardenUIUpdate): void;
  /** Stamps the new level and names what it unlocked (motion.md 4.7). */
  levelUp(level: number, unlocked: readonly string[], reducedMotion: boolean): void;
  /** "While you were away" card with a one-tap harvest of everything ripe. */
  showAway(ripeCount: number, onHarvestAll: () => void): void;
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
  const shopButton = document.createElement('button');
  shopButton.type = 'button'; shopButton.className = 'garden-ui__shop'; shopButton.setAttribute('aria-label', 'Shop');
  shopButton.innerHTML = '<span aria-hidden="true">▣</span> Shop';
  const shop = document.createElement('div'); shop.className = 'garden-ui__shop-backdrop'; shop.hidden = true;
  const sheet = document.createElement('section'); sheet.className = 'garden-ui__shop-sheet'; sheet.setAttribute('aria-label', 'Shop');
  const shopHead = document.createElement('header'); shopHead.innerHTML = '<strong>Shop</strong>';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'garden-ui__shop-close'; close.textContent = 'Close';
  shopHead.append(close); sheet.append(shopHead);
  const shopItems: readonly { id: ShopItemId; title: string; desc: string; price: number; level: number }[] = [
    { id: 'plot-6', title: 'Plot 7', desc: 'Grow the island west.', price: SHOP_PRICES['plot-6'], level: 3 },
    { id: 'plot-7', title: 'Plot 8', desc: 'Add another garden bed.', price: SHOP_PRICES['plot-7'], level: 4 },
    { id: 'big-can', title: 'Big can', desc: 'Tap once to water every growing plant.', price: SHOP_PRICES['big-can'], level: 3 },
    { id: 'fertiliser', title: 'Fertiliser', desc: 'Next seed grows 40% faster.', price: SHOP_PRICES.fertiliser, level: 1 },
    { id: 'lucky-charm', title: 'Lucky charm', desc: '+3% natural mutation chance.', price: SHOP_PRICES['lucky-charm'], level: 5 },
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
  shopButton.addEventListener('click', () => { shop.hidden = false; });
  shop.addEventListener('click', (event) => { if (event.target === shop) shop.hidden = true; });
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
    seedTray.append(button);
    return { species, button, detail: detailText, locked: null as boolean | null };
  });
  seedTray.prepend(trayLabel);

  const stamp = document.createElement('div');
  stamp.className = 'garden-ui__stamp';
  stamp.setAttribute('role', 'status');
  stamp.hidden = true;
  stamp.addEventListener('click', () => { clearTimeout(stampTimer); stamp.hidden = true; });

  const away = document.createElement('div');
  away.className = 'garden-ui__away';
  away.hidden = true;
  const awayText = document.createElement('p');
  const awayButton = document.createElement('button');
  awayButton.type = 'button';
  awayButton.className = 'garden-ui__away-button';
  awayButton.textContent = 'Harvest all';
  away.append(awayText, awayButton);
  away.addEventListener('click', (event) => { if (event.target === away) away.hidden = true; });
  let onAwayHarvest: (() => void) | null = null;
  awayButton.addEventListener('click', () => {
    onAwayHarvest?.();
    away.hidden = true;
  });

  overlay.append(coinStatus, crateAmount, levelBadge, toggles, hint, stamp, away, seedTray);
  seedTray.append(harvestAll, sell);
  // Main actions live in the bottom third (AGENTS.md): Shop is a tab on the seed tray.
  seedTray.append(shopButton);
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
    levelText.textContent = `Level ${level}`;
    const progress = Math.round(Math.min(1, Math.max(0, state.levelProgress ?? 0)) * 100);
    levelFill.style.width = `${progress}%`;
    levelBar.setAttribute('aria-valuenow', String(progress));
    hint.textContent = state.hint ?? '';
    hint.hidden = !state.hint;
    // Objectives fit one line; rare long notices (saves) wrap so nothing is cut off.
    hint.classList.toggle('is-long', (state.hint ?? '').length > 40);
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
    const owned = state.owned ?? [];
    trayLabel.textContent = state.fertiliser ? `Seeds · Fertiliser x${state.fertiliser}` : 'Seeds';
    bigCan.hidden = !owned.includes('big-can');
    bigCan.textContent = `Water all${state.fertiliser ? ` · Fertiliser x${state.fertiliser}` : ''}`;
    for (const { item, row, action } of shopRows) {
      const has = owned.includes(item.id);
      const locked = level < item.level;
      const affordable = state.coins >= item.price;
      row.classList.toggle('is-muted', locked || !affordable);
      action.disabled = (has && item.id !== 'fertiliser') || locked || !affordable;
      action.textContent = has && item.id !== 'fertiliser' ? 'Owned' : item.id === 'fertiliser' && (state.fertiliser ?? 0) > 0 ? 'Add one' : locked ? `Level ${item.level}` : `Buy · ${item.price}`;
    }
    for (const seed of seedButtons) {
      const selected = seed.species.id === state.selectedId;
      const locked = seed.species.unlockLevel > level;
      seed.button.setAttribute('aria-pressed', String(selected));
      seed.button.classList.toggle('is-selected', selected);
      // Unlocked but unaffordable: still selectable, but the price reads as out of reach.
      seed.button.classList.toggle('is-short', !locked && state.coins < seed.species.cost);
      if (seed.locked !== locked) {
        seed.button.setAttribute('aria-disabled', String(locked));
        seed.button.classList.toggle('is-locked', locked);
        seed.detail.textContent = locked ? `Level ${seed.species.unlockLevel}` : `${seed.species.cost} ${seed.species.cost === 1 ? 'coin' : 'coins'}`;
        seed.locked = locked;
      }
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
    showAway(ripeCount, onHarvestAll) {
      awayText.textContent = `${ripeCount} ${ripeCount === 1 ? 'plant' : 'plants'} ripened while you were away.`;
      onAwayHarvest = onHarvestAll;
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
      overlay.remove();
    },
  };
}
