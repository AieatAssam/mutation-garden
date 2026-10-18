import type { SpeciesId } from '../sim';
import './garden-ui.css';

export interface SeedDescriptor {
  readonly id: SpeciesId;
  readonly name: string;
}

export interface GardenUIOptions {
  readonly species: readonly SeedDescriptor[];
  readonly selectedId: SpeciesId;
  readonly coins: number;
  readonly onSelect: (speciesId: SpeciesId) => void;
}

export interface GardenUIUpdate {
  readonly selectedId: SpeciesId;
  readonly coins: number;
}

export interface GardenUI {
  update(update: GardenUIUpdate): void;
  dispose(): void;
}

/** Mount the app's seed and coin controls into an owned overlay container. */
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
  const coinMark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  coinMark.classList.add('garden-ui__coin-mark');
  coinMark.setAttribute('viewBox', '0 0 40 40');
  coinMark.setAttribute('focusable', 'false');
  const rim = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  rim.classList.add('garden-ui__coin-ridges');
  rim.setAttribute('d', 'M20 2v4 M26.9 3.2l-1.4 3.8 M33 7l-2.8 2.8 M36.8 13.1 33 14.5 M38 20h-4 M36.8 26.9 33 25.5 M33 33l-2.8-2.8 M26.9 36.8l-1.4-3.8 M20 38v-4 M13.1 36.8l1.4-3.8 M7 33l2.8-2.8 M3.2 26.9 7 25.5 M2 20h4 M3.2 13.1 7 14.5 M7 7l2.8 2.8 M13.1 3.2l1.4 3.8');
  const innerRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  innerRing.classList.add('garden-ui__coin-inner-ring');
  innerRing.setAttribute('cx', '20');
  innerRing.setAttribute('cy', '20');
  innerRing.setAttribute('r', '10');
  const seed = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  seed.classList.add('garden-ui__coin-seed');
  seed.setAttribute('d', 'M17 23c-2.4-2.3-1.1-6.2 3-6.8 2.1 2.1 2.1 5.2-3 6.8Zm3-1.8c0-3 1.4-5 4-6');
  coinMark.append(rim, innerRing, seed);
  coinToken.append(coinMark);
  const coinAmount = document.createElement('span');
  coinAmount.className = 'garden-ui__coin-amount';
  coinStatus.append(coinToken, coinAmount);

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
    button.textContent = species.name;
    button.dataset.speciesId = species.id;
    button.addEventListener('click', () => options.onSelect(species.id));
    seedTray.append(button);
    return { id: species.id, button };
  });
  seedTray.prepend(trayLabel);

  overlay.append(coinStatus, seedTray);
  container.append(overlay);

  const update = ({ selectedId, coins }: GardenUIUpdate) => {
    coinAmount.textContent = String(coins);
    for (const seed of seedButtons) {
      const selected = seed.id === selectedId;
      seed.button.setAttribute('aria-pressed', String(selected));
      seed.button.classList.toggle('is-selected', selected);
    }
  };
  update(options);

  let disposed = false;
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      overlay.remove();
    },
  };
}
