import type { PlotId, SimEvent, TraitId } from '../sim';
import './mutation-reveal.css';
import { readingTimeMs } from './notice-queue';
import { SPECIES } from '../sim';

const TRAITS: Record<TraitId, { name: string; tier: number; line: string }> = {
  giant: { name: 'Giant', tier: 1, line: 'Water a plant twice to grow a Giant.' },
  golden: { name: 'Golden', tier: 2, line: 'Plant beside two Sunny Sprouts for Golden.' },
  glowing: { name: 'Glowing', tier: 2, line: 'Plant beside a Puffcap for Glowing.' },
  crystal: { name: 'Crystal', tier: 3, line: 'Replant a pond-side plot after harvesting Glowing fruit.' },
  rainbow: { name: 'Rainbow', tier: 4, line: 'Harvest Golden, Glowing and Crystal together, then replant one of those plots.' },
  frozen: { name: 'Frozen', tier: 3, line: 'Grow a Dewbell beside this plant.' },
  electric: { name: 'Electric', tier: 3, line: 'Let Sprinkler II water this plant twice.' },
  twin: { name: 'Twin', tier: 3, line: 'Plant beside a mature Clockvine.' },
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
  let active = false;
  let disposed = false;
  const queue: { event: Extract<SimEvent, { type: 'Mutated' }>; reducedMotion: boolean }[] = [];
  const clear = () => {
    clearTimeout(timer);
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
      bonus.textContent = `+${event.bonusCoins} coins · +${event.bonusXp} XP first-find bonus`;
      details.append(bonus);
    }
    const share = document.createElement('button');
    share.className = 'mutation-reveal__share';
    share.type = 'button';
    share.textContent = 'Save discovery card';
    share.addEventListener('click', async (click) => {
      click.preventDefault(); click.stopPropagation();
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const context = canvas.getContext('2d');
      if (!context) return;
      const style = getComputedStyle(layer);
      context.fillStyle = style.getPropertyValue('--mg-ui-panel').trim(); context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = style.getPropertyValue('--mg-ui-border').trim(); context.lineWidth = 10; context.strokeRect(20, 20, 920, 500);
      context.fillStyle = style.getPropertyValue('--mg-ui-text').trim(); context.textAlign = 'center';
      context.font = 'bold 38px Atkinson Hyperlegible, sans-serif'; context.fillText('MUTATION GARDEN', 480, 112);
      context.font = 'bold 62px Fraunces, serif'; context.fillText(`New ${trait.name}`, 480, 230);
      context.font = 'bold 36px Atkinson Hyperlegible, sans-serif';
      context.fillText(SPECIES.find(({ id }) => id === event.speciesId)?.name ?? 'Garden discovery', 480, 312);
      context.font = '28px Atkinson Hyperlegible, sans-serif'; context.fillText(trait.line, 480, 386, 820);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `${event.speciesId}-${trait.name.toLowerCase()}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try { await navigator.share({ files: [file], title: `${trait.name} discovery` }); } catch { /* Sharing can be cancelled. */ }
      } else {
        const url = URL.createObjectURL(blob); const download = document.createElement('a');
        download.href = url; download.download = file.name; download.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    });
    if (event.firstDiscovery) details.append(share);
    labelTimer = window.setTimeout(() => {
      panel.append(title);
      if (!reducedMotion && trait.name !== 'Electric') {
        flash.classList.add('mutation-reveal__flash--active');
        window.setTimeout(() => flash.classList.remove('mutation-reveal__flash--active'), 120);
      }
      detailTimer = window.setTimeout(() => panel.append(details), 250);
    }, 1600);
    layer.onpointerdown = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); };
    layer.onpointerup = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); };
    layer.onclick = (pointer) => { pointer.preventDefault(); pointer.stopPropagation(); next(); };
    timer = window.setTimeout(next, 1_600 + readingTimeMs(`${title.textContent ?? ''} ${trait.line}`));
  };
  const show = (event: Extract<SimEvent, { type: 'Mutated' }>, reducedMotion: boolean) => {
    const mutations = [...event.mutations].sort((a, b) => (a === 'giant' ? -1 : 0) - (b === 'giant' ? -1 : 0));
    for (const [index, mutation] of mutations.entries()) {
      const single = { ...event, mutations: [mutation], bonusCoins: index === 0 ? event.bonusCoins : 0, bonusXp: index === 0 ? event.bonusXp : 0 };
      const trait = TRAITS[mutation];
      if (!trait) continue;
      if (!event.firstDiscovery) {
        const point = projectPlot(event.plotId);
        if (!point) continue;
        const label = document.createElement('span');
        label.className = 'mutation-reveal__repeat'; label.textContent = trait.name;
        label.style.left = `${point.x}px`; label.style.top = `${point.y}px`;
        layer.append(label); setTimeout(() => label.remove(), readingTimeMs(trait.name));
      } else queue.push({ event: single, reducedMotion });
    }
    const pending = !active ? queue.shift() : undefined;
    if (pending && !disposed) display(pending.event, pending.reducedMotion);
  };
  return { show, dispose() { disposed = true; queue.length = 0; clear(); layer.remove(); } };
}
