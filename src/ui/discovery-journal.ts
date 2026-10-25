import type { SpeciesId, TraitId } from '../sim';
import './discovery-journal.css';

export interface JournalTraitDescriptor {
  readonly id: TraitId;
  readonly name: string;
  readonly multiplier: number;
  readonly rule: string;
  readonly naturalChance: number;
  readonly ruleOdds?: string;
  readonly prerequisite?: string;
  /** First level at which the recipe is learnable. Defaults to level 1. */
  readonly hintLevel?: number;
  readonly prerequisites?: readonly TraitId[];
  /** Current opportunities, supplied by the app without journal-side rule checks. */
  readonly opportunities?: readonly string[];
}

export interface JournalSpeciesDescriptor {
  readonly id: SpeciesId;
  readonly name: string;
  readonly unlockLevel: number;
}

export interface JournalOrder {
  readonly title: string;
  readonly progress: number;
  readonly target: number;
  readonly rewardCoins: number;
  readonly rewardXp: number;
  readonly bonusSpeciesId?: SpeciesId;
  readonly bonusPercent?: number;
}

export interface DiscoveryJournalOptions {
  readonly species: readonly JournalSpeciesDescriptor[];
  readonly traits: readonly JournalTraitDescriptor[];
  readonly onOpen?: () => void;
}

export interface DiscoveryJournalUpdate {
  readonly discoveries: readonly string[];
  readonly level: number;
  readonly naturalChanceBonus?: number;
  readonly opportunities?: Partial<Record<TraitId, readonly string[]>>;
  readonly order?: JournalOrder;
}

export interface DiscoveryJournal {
  readonly button: HTMLButtonElement;
  update(update: DiscoveryJournalUpdate): void;
  close(): void;
  dispose(): void;
}

function plantSilhouette(speciesId?: SpeciesId): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('discovery-journal__silhouette');
  if (speciesId === 'sunny-sprout') {
    const head = document.createElementNS(svg.namespaceURI, 'circle');
    head.setAttribute('cx', '12'); head.setAttribute('cy', '7'); head.setAttribute('r', '4.5');
    const stem = document.createElementNS(svg.namespaceURI, 'path');
    stem.setAttribute('d', 'M12 11v9');
    stem.setAttribute('fill', 'none'); stem.setAttribute('stroke', 'currentColor');
    stem.setAttribute('stroke-width', '2.5'); stem.setAttribute('stroke-linecap', 'round');
    svg.append(head, stem);
  } else if (speciesId === 'bubble-berry') {
    for (const [cx, cy, r] of [[8, 10, 4], [15, 9, 4], [12, 15, 4]] as const) {
      const berry = document.createElementNS(svg.namespaceURI, 'circle');
      berry.setAttribute('cx', String(cx)); berry.setAttribute('cy', String(cy)); berry.setAttribute('r', String(r));
      svg.append(berry);
    }
    const leaf = document.createElementNS(svg.namespaceURI, 'path');
    leaf.setAttribute('d', 'M10 5c2-3 6-3 8-2-1 3-4 4-7 4');
    svg.append(leaf);
  } else if (speciesId === 'twistroot') {
    const root = document.createElementNS(svg.namespaceURI, 'path');
    root.setAttribute('d', 'M12 21c-5 0-5-5 0-5s5-5 0-5-5-5 0-5 5-3 0-3');
    root.setAttribute('fill', 'none'); root.setAttribute('stroke', 'currentColor');
    root.setAttribute('stroke-width', '3'); root.setAttribute('stroke-linecap', 'round');
    svg.append(root);
  } else if (speciesId === 'puffcap') {
    const cap = document.createElementNS(svg.namespaceURI, 'path');
    cap.setAttribute('d', 'M3 11a9 8 0 0 1 18 0Z');
    const stem = document.createElementNS(svg.namespaceURI, 'path');
    stem.setAttribute('d', 'M9 11v9h6v-9Z');
    svg.append(cap, stem);
  } else if (speciesId === 'lantern-pod') {
    const stems = document.createElementNS(svg.namespaceURI, 'path');
    stems.setAttribute('d', 'M12 21V4m0 3L6 11m6-4 6 4');
    stems.setAttribute('fill', 'none'); stems.setAttribute('stroke', 'currentColor'); stems.setAttribute('stroke-width', '1.8');
    for (const [cx, cy] of [[6, 14], [18, 14], [12, 17]] as const) {
      const pod = document.createElementNS(svg.namespaceURI, 'ellipse');
      pod.setAttribute('cx', String(cx)); pod.setAttribute('cy', String(cy)); pod.setAttribute('rx', '2.5'); pod.setAttribute('ry', '3.5');
      svg.append(pod);
    }
    svg.prepend(stems);
  } else if (speciesId === 'comet-pear') {
    const pear = document.createElementNS(svg.namespaceURI, 'path');
    pear.setAttribute('d', 'M11 9c-5 5-3 11 1 11s7-6 1-11c-1-1-1-3-1-4');
    const tail = document.createElementNS(svg.namespaceURI, 'path');
    tail.setAttribute('d', 'M9 13 3 10m6 5-5 1'); tail.setAttribute('fill', 'none'); tail.setAttribute('stroke', 'currentColor'); tail.setAttribute('stroke-width', '1.7');
    svg.append(pear, tail);
  } else if (speciesId === 'clockvine') {
    const vine = document.createElementNS(svg.namespaceURI, 'path');
    vine.setAttribute('d', 'M12 21V14c-6 1-7-4-5-7m5 7c6 0 7-4 5-8');
    const seed = document.createElementNS(svg.namespaceURI, 'circle');
    seed.setAttribute('cx', '12'); seed.setAttribute('cy', '15'); seed.setAttribute('r', '2.4');
    svg.append(vine, seed);
  } else if (speciesId === 'dewbell') {
    const bell = document.createElementNS(svg.namespaceURI, 'path');
    bell.setAttribute('d', 'M12 3v4m0 0c-1 5-5 5-5 9h10c0-4-4-4-5-9Zm0 13v2');
    const dew = document.createElementNS(svg.namespaceURI, 'circle');
    dew.setAttribute('cx', '12'); dew.setAttribute('cy', '21'); dew.setAttribute('r', '1.5');
    svg.append(bell, dew);
  } else {
    const stem = document.createElementNS(svg.namespaceURI, 'path');
    stem.setAttribute('d', 'M11 21V10c0-3 2-5 5-6-1 4-2 6-5 7');
    const leaf = document.createElementNS(svg.namespaceURI, 'path');
    leaf.setAttribute('d', 'M11 15C8 11 5 11 3 12c1 4 4 6 8 5m1-2c2-4 5-5 9-4-1 4-4 6-9 6');
    svg.append(stem, leaf);
  }
  for (const shape of svg.children) {
    if (shape.getAttribute('fill') !== 'none') shape.setAttribute('fill', 'currentColor');
  }
  return svg;
}

export function createDiscoveryJournal(container: HTMLElement, options: DiscoveryJournalOptions): DiscoveryJournal {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'garden-ui__journal';
  button.textContent = 'Journal';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');

  const dialog = document.createElement('dialog');
  dialog.className = 'discovery-journal';
  dialog.setAttribute('aria-labelledby', 'discovery-journal-title');
  const head = document.createElement('header');
  head.className = 'discovery-journal__head';
  const title = document.createElement('h2');
  title.id = 'discovery-journal-title';
  title.textContent = 'Discoveries';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'discovery-journal__close';
  closeButton.textContent = 'Close';
  head.append(title, closeButton);
  const progress = document.createElement('p');
  progress.className = 'discovery-journal__progress';
  const pageNav = document.createElement('nav');
  pageNav.className = 'discovery-journal__pages';
  const cataloguePageButton = document.createElement('button');
  cataloguePageButton.type = 'button'; cataloguePageButton.textContent = 'Catalogue';
  const pairsPageButton = document.createElement('button');
  pairsPageButton.type = 'button'; pairsPageButton.textContent = 'Pairs';
  pageNav.append(cataloguePageButton, pairsPageButton);
  const order = document.createElement('section');
  order.className = 'discovery-journal__order';
  order.hidden = true;
  const catalogue = document.createElement('div');
  catalogue.className = 'discovery-journal__catalogue';
  const table = document.createElement('table');
  const tableHead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const seedHeading = document.createElement('th');
  seedHeading.scope = 'col';
  seedHeading.textContent = 'Seed';
  headerRow.append(seedHeading);
  for (const trait of options.traits) {
    const heading = document.createElement('th');
    heading.scope = 'col';
    heading.textContent = `${trait.name} ×${trait.multiplier}`;
    headerRow.append(heading);
  }
  tableHead.append(headerRow);
  const tableBody = document.createElement('tbody');
  table.append(tableHead, tableBody);
  catalogue.append(table);
  const recipes = document.createElement('div');
  recipes.className = 'discovery-journal__recipes';
  const recipeRows = options.traits.map((trait) => {
    const article = document.createElement('article');
    article.className = 'discovery-journal__recipe';
    const recipeTitle = document.createElement('h3');
    recipeTitle.textContent = `${trait.name} ×${trait.multiplier}`;
    const recipeText = document.createElement('p');
    const odds = document.createElement('p');
    article.append(recipeTitle, recipeText, odds);
    recipes.append(article);
    return { trait, recipeText, odds };
  });
  const pairs = document.createElement('section');
  pairs.className = 'discovery-journal__pairs'; pairs.hidden = true;
  const pairRows: { first: JournalTraitDescriptor; second: JournalTraitDescriptor; label: HTMLElement; status: HTMLElement }[] = [];
  for (let firstIndex = 0; firstIndex < options.traits.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < options.traits.length; secondIndex += 1) {
      const first = options.traits[firstIndex]!; const second = options.traits[secondIndex]!;
      const card = document.createElement('article'); card.className = 'discovery-journal__pair';
      const label = document.createElement('strong'); const status = document.createElement('span');
      label.classList.add('discovery-journal__pair-label');
      card.append(label, status); pairs.append(card); pairRows.push({ first, second, label, status });
    }
  }

  const cells = options.species.map((species) => {
    const row = document.createElement('tr');
    const speciesHead = document.createElement('th');
    speciesHead.className = 'discovery-journal__species-name';
    speciesHead.scope = 'row';
    speciesHead.textContent = species.name;
    const rows = options.traits.map((trait) => {
      const cell = document.createElement('td');
      cell.className = 'discovery-journal__entry';
      const traitName = document.createElement('strong');
      const status = document.createElement('span');
      status.className = 'discovery-journal__status';
      cell.append(traitName, status);
      row.append(cell);
      return { species, trait, row, speciesHead, cell, traitName, status };
    });
    row.prepend(speciesHead);
    tableBody.append(row);
    return rows;
  }).flat();
  dialog.append(head, order, progress, pageNav, catalogue, recipes, pairs);
  container.append(dialog);

  let state: DiscoveryJournalUpdate = { discoveries: [], level: 1 };
  let lastRenderKey: string | null = null;
  const render = (next: DiscoveryJournalUpdate) => {
    const key = JSON.stringify([
      next.level,
      next.naturalChanceBonus ?? 0,
      [...next.discoveries].sort(),
      Object.entries(next.opportunities ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      next.order?.title,
      next.order?.progress,
      next.order?.target,
      next.order?.rewardCoins,
      next.order?.rewardXp,
    ]);
    if (key === lastRenderKey) return;
    lastRenderKey = key;
    state = next;
    const found = cells.filter(({ species, trait }) => state.discoveries.includes(`${species.id}:${trait.id}`)).length;
    const total = cells.length;
    progress.textContent = `${found} of ${total} entries found`;
    button.textContent = `Journal ${found}/${total}`;
    if (state.order) {
      const { title: orderTitle, progress: done, target, rewardCoins, rewardXp, bonusSpeciesId, bonusPercent } = state.order;
      order.hidden = false;
      order.replaceChildren();
      const label = document.createElement('strong');
      label.textContent = orderTitle;
      const detail = document.createElement('span');
      const bonus = bonusSpeciesId ? ` · ${options.species.find(({ id }) => id === bonusSpeciesId)?.name ?? bonusSpeciesId} +${bonusPercent ?? 0}%` : '';
      detail.textContent = `${done} of ${target} · ${rewardCoins} coins · ${rewardXp} XP${bonus}`;
      order.append(label, detail);
    } else {
      order.hidden = true;
    }
    for (const { species, trait, row, speciesHead, cell, traitName, status } of cells) {
      const lockedSpecies = species.unlockLevel > state.level;
      const foundEntry = state.discoveries.includes(`${species.id}:${trait.id}`);
      row.classList.toggle('is-locked', lockedSpecies);
      speciesHead.textContent = lockedSpecies ? `${species.name} · Level ${species.unlockLevel}` : species.name;
      cell.classList.toggle('is-found', foundEntry);
      cell.classList.toggle('is-unknown', !foundEntry && !lockedSpecies);
      traitName.replaceChildren();
      if (foundEntry) traitName.textContent = 'Found';
      else traitName.append(plantSilhouette(species.id));
      traitName.setAttribute('aria-label', foundEntry ? trait.name : 'Unknown mutation silhouette');
      status.textContent = foundEntry ? 'First on this device' : lockedSpecies ? 'Locked' : 'Not found';
    }
    for (const { trait, recipeText, odds } of recipeRows) {
      const hintLevel = trait.hintLevel ?? 1;
      const prerequisiteFound = !trait.prerequisites?.length || trait.prerequisites.every((required) => state.discoveries.some((entry) => entry.endsWith(`:${required}`)));
      recipeText.textContent = state.level >= hintLevel && prerequisiteFound
        ? [trait.rule, ...(state.opportunities?.[trait.id] ?? trait.opportunities ?? [])].filter(Boolean).join(' ')
        : trait.prerequisite ?? `Recipe available at Level ${hintLevel}.`;
      const chance = trait.naturalChance + (state.level >= 2 ? state.naturalChanceBonus ?? 0 : 0);
      const chanceLabel = `${Number((chance * 100).toFixed(1))}% natural chance`;
      const naturalOdds = trait.naturalChance > 0
        ? state.level >= 2 ? chanceLabel : `${chanceLabel} · Natural chance starts at Level 2.`
        : 'No natural chance.';
      odds.textContent = [naturalOdds, trait.ruleOdds].filter(Boolean).join(' · ');
    }
    for (const { first, second, label, status } of pairRows) {
      const found = state.discoveries.some((entry) => entry.endsWith(`:${first.id}`))
        && state.discoveries.some((entry) => entry.endsWith(`:${second.id}`));
      label.replaceChildren();
      if (found) {
        label.removeAttribute('aria-label');
        label.textContent = `${first.name} + ${second.name}`;
      }
      else {
        label.append(plantSilhouette(), document.createTextNode(' + '), plantSilhouette());
        label.setAttribute('aria-label', 'Unknown trait pair');
      }
      status.textContent = found ? 'Both traits found' : 'Unknown pair';
    }
  };
  const setPage = (page: 'catalogue' | 'pairs') => {
    const showPairs = page === 'pairs';
    catalogue.hidden = showPairs; recipes.hidden = showPairs; pairs.hidden = !showPairs;
    cataloguePageButton.setAttribute('aria-pressed', String(!showPairs));
    pairsPageButton.setAttribute('aria-pressed', String(showPairs));
  };
  const open = () => {
    options.onOpen?.();
    if (!dialog.open) {
      dialog.showModal();
      button.setAttribute('aria-expanded', 'true');
    }
  };
  const close = () => { if (dialog.open) dialog.close(); };
  button.addEventListener('click', open);
  cataloguePageButton.addEventListener('click', () => setPage('catalogue'));
  pairsPageButton.addEventListener('click', () => setPage('pairs'));
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  });
  render(state);
  setPage('catalogue');
  const update = (next: DiscoveryJournalUpdate) => render(next);

  return {
    button,
    update,
    close,
    dispose() { close(); button.remove(); dialog.remove(); },
  };
}
