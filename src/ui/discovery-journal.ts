import type { SpeciesId, TraitId } from '../sim';
import './discovery-journal.css';

export interface JournalTraitDescriptor {
  readonly id: TraitId;
  readonly name: string;
  readonly multiplier: number;
  readonly rule: string;
  readonly naturalChance: number;
  readonly prerequisite?: string;
  /** First level at which the recipe is learnable. Defaults to level 1. */
  readonly hintLevel?: number;
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
  dialog.append(head, order, progress, catalogue, recipes);
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
      const { title: orderTitle, progress: done, target, rewardCoins, rewardXp } = state.order;
      order.hidden = false;
      order.replaceChildren();
      const label = document.createElement('strong');
      label.textContent = orderTitle;
      const detail = document.createElement('span');
      detail.textContent = `${done} of ${target} · ${rewardCoins} coins · ${rewardXp} XP`;
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
      traitName.textContent = foundEntry ? 'Found' : '?';
      status.textContent = foundEntry ? 'First on this device' : lockedSpecies ? 'Locked' : 'Not found';
    }
    for (const { trait, recipeText, odds } of recipeRows) {
      const hintLevel = trait.hintLevel ?? 1;
      recipeText.textContent = state.level >= hintLevel
        ? [trait.rule, ...(state.opportunities?.[trait.id] ?? trait.opportunities ?? [])].filter(Boolean).join(' ')
        : trait.prerequisite ?? `Recipe available at Level ${hintLevel}.`;
      const chance = trait.naturalChance + (state.level >= 2 ? state.naturalChanceBonus ?? 0 : 0);
      const chanceLabel = `${Number((chance * 100).toFixed(1))}% natural chance`;
      odds.textContent = trait.naturalChance > 0
        ? state.level >= 2 ? chanceLabel : `${chanceLabel} · Natural chance starts at Level 2.`
        : 'No natural chance.';
    }
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
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  });
  render(state);
  const update = (next: DiscoveryJournalUpdate) => render(next);

  return {
    button,
    update,
    close,
    dispose() { close(); button.remove(); dialog.remove(); },
  };
}
