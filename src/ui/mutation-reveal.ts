import type { PlotId, SimEvent, TraitId } from '../sim';
import './mutation-reveal.css';

const TRAITS: Record<TraitId, { name: string; tier: number; line: string }> = {
  giant: { name: 'Giant', tier: 1, line: 'Water a plant twice to grow a Giant.' },
  golden: { name: 'Golden', tier: 2, line: 'Keep tending plants to find Golden mutations.' },
  glowing: { name: 'Glowing', tier: 2, line: 'Keep tending plants to find Glowing mutations.' },
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
  let timer = 0;
  let labelTimer = 0;
  let detailTimer = 0;
  const close = () => {
    clearTimeout(timer);
    clearTimeout(labelTimer);
    clearTimeout(detailTimer);
    layer.replaceChildren();
    layer.className = 'mutation-reveal';
  };
  const show = (event: Extract<SimEvent, { type: 'Mutated' }>, reducedMotion: boolean) => {
    const trait = TRAITS[event.mutations[0]!];
    if (!trait) return;
    if (!event.firstDiscovery) {
      const point = projectPlot(event.plotId);
      if (!point) return;
      const label = document.createElement('span');
      label.className = 'mutation-reveal__repeat';
      label.textContent = trait.name;
      label.style.left = `${point.x}px`;
      label.style.top = `${point.y}px`;
      layer.append(label);
      setTimeout(() => label.remove(), 900);
      return;
    }
    close();
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
    layer.onclick = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); close(); };
    timer = window.setTimeout(close, 3200);
  };
  return { show, dispose() { close(); layer.remove(); } };
}
