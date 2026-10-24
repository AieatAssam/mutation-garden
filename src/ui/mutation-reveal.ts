import type { PlotId, SimEvent, TraitId } from '../sim';
import './mutation-reveal.css';

const TRAITS: Record<TraitId, { name: string; tier: number; line: string }> = {
  giant: { name: 'Giant', tier: 1, line: 'Water a plant twice to grow a Giant.' },
  golden: { name: 'Golden', tier: 2, line: 'Plant beside two Sunny Sprouts for Golden.' },
  glowing: { name: 'Glowing', tier: 2, line: 'Plant beside a Puffcap for Glowing.' },
  crystal: { name: 'Crystal', tier: 3, line: 'A Crystal grows beside the pond.' },
  rainbow: { name: 'Rainbow', tier: 4, line: 'Pair mutations to discover Rainbow.' },
};

export interface MutationReveal {
  show(event: Extract<SimEvent, { type: 'Mutated' }>, reducedMotion: boolean): void;
  dispose(): void;
}

export function createMutationReveal(container: HTMLElement, projectPlot: (plotId: PlotId) => { x: number; y: number } | null): MutationReveal {
  const layer = document.createElement('div');
  layer.className = 'mutation-reveal';
  container.append(layer);

  let labelTimer = 0;
  let detailTimer = 0;
  let active = false;
  let disposed = false;
  const queue: { event: Extract<SimEvent, { type: 'Mutated' }>; reducedMotion: boolean }[] = [];
  const clear = () => {

    clearTimeout(labelTimer);
    clearTimeout(detailTimer);
    layer.replaceChildren();
    layer.className = 'mutation-reveal';
    layer.onclick = null;
    layer.onpointerdown = null;
    layer.onpointerup = null;
  };
  const next = () => {
    active = false;
    clear();
    const pending = queue.shift();
    if (!disposed && pending) display(pending.event, pending.reducedMotion);
  };
  const display = (event: Extract<SimEvent, { type: 'Mutated' }>, reducedMotion: boolean) => {
    active = true;
    const trait = TRAITS[event.mutations[0]!];
    if (!trait) { active = false; return; }
    layer.classList.add('mutation-reveal--full');
    layer.classList.toggle('mutation-reveal--reduced', reducedMotion);
    const flash = document.createElement('div');
    flash.className = 'mutation-reveal__flash';
    const panel = document.createElement('div');
    panel.className = 'mutation-reveal__panel';
    panel.setAttribute('role', 'status');
    const title = document.createElement('div');
    title.className = 'mutation-reveal__title';
    title.textContent = `New mutation: ${trait.name}!`;
    layer.append(flash, panel);
    const details = document.createElement('div');
    details.className = 'mutation-reveal__details';
    const stars = document.createElement('span');
    stars.className = 'mutation-reveal__stars';
    stars.setAttribute('aria-label', `Tier ${trait.tier}`);
    stars.textContent = '★'.repeat(trait.tier);
    const line = document.createElement('span');
    line.className = 'mutation-reveal__line';
    line.textContent = trait.line;
    details.append(stars, line);
    if (event.bonusCoins > 0) {
      const bonus = document.createElement('span'); bonus.className = 'mutation-reveal__line';
      bonus.textContent = `+${event.bonusCoins} coins first-find bonus`;
      details.append(bonus);
    }
    labelTimer = window.setTimeout(() => {
      panel.append(title);
      if (!reducedMotion) {
        flash.classList.add('mutation-reveal__flash--active');
        window.setTimeout(() => flash.classList.remove('mutation-reveal__flash--active'), 120);
      }
      detailTimer = window.setTimeout(() => panel.append(details), 250);
    }, 1600);
    layer.onpointerdown = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); };
    layer.onpointerup = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); };
    layer.onclick = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); next(); };
    // A first discovery is the game's big moment: it stays until the player taps, so it is always read.
    const hint = document.createElement('span');
    hint.className = 'mutation-reveal__line mutation-reveal__hint';
    hint.textContent = 'Tap to continue';
    details.append(hint);
  };
  const show = (event: Extract<SimEvent, { type: 'Mutated' }>, reducedMotion: boolean) => {
    const mutations = [...event.mutations].sort((a, b) => (a === 'giant' ? -1 : 0) - (b === 'giant' ? -1 : 0));
    for (const [index, mutation] of mutations.entries()) {
      const single = { ...event, mutations: [mutation], bonusCoins: index === 0 ? event.bonusCoins : 0 };
      const trait = TRAITS[mutation];
      if (!trait) continue;
      if (!event.firstDiscovery) {
        const point = projectPlot(event.plotId);
        if (!point) continue;
        const label = document.createElement('span');
        label.className = 'mutation-reveal__repeat'; label.textContent = trait.name;
        label.style.left = `${point.x}px`; label.style.top = `${point.y}px`;
        layer.append(label); setTimeout(() => label.remove(), 2500);
      } else queue.push({ event: single, reducedMotion });
    }
    const pending = !active ? queue.shift() : undefined;
    if (pending && !disposed) display(pending.event, pending.reducedMotion);
  };
  return { show, dispose() { disposed = true; queue.length = 0; clear(); layer.remove(); } };
}
