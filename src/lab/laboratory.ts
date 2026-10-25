import type { GardenState, Fruit, SimEvent } from '../sim';
import './laboratory.css';

interface LaboratoryOptions {
  readonly getState: () => GardenState;
  readonly store: (crateIndex: number, expectedFruit: Fruit) => void;
  readonly merge: (specimenIds: readonly number[]) => void;
  readonly returnToCrate: (specimenIds: readonly number[]) => void;
  readonly close: () => void;
}

export function createLaboratory(root: HTMLElement, options: LaboratoryOptions) {
  const panel = document.createElement('dialog');
  panel.className = 'laboratory';
  panel.setAttribute('aria-label', 'Mutation Laboratory');
  panel.innerHTML = '<header class="laboratory__head"><div><p>FIELD STATION 01</p><h1>Mutation Laboratory</h1></div><button type="button" aria-label="Close laboratory">Close</button></header><div class="laboratory__scene"><div class="laboratory__shelf"></div><div class="laboratory__jar" role="group" aria-label="Drop fruit into the glass jar"><div class="laboratory__jar-contents"></div><span>DROP FRUIT HERE</span></div><p class="laboratory__status" role="status" aria-live="polite">Drop fruit into the jar. Touching specimens mix.</p></div><section class="laboratory__tray"><h2>Lab tray</h2><p class="laboratory__empty" hidden>Harvest fruit in the garden, then bring it here.</p><div class="laboratory__specimens"></div><button class="laboratory__mix" type="button" disabled>Mix selected</button><button class="laboratory__return" type="button" disabled>Return selected</button><div class="laboratory__seeds" aria-label="Lab seeds"></div></section><section class="laboratory__crate"><h2>Crate <span></span></h2><div class="laboratory__fruit"></div></section>';
  root.append(panel);
  panel.showModal();
  const close = panel.querySelector('button')!;
  close.focus();
  panel.addEventListener('cancel', (event) => { event.preventDefault(); options.close(); });
  const jar = panel.querySelector<HTMLElement>('.laboratory__jar')!;
  const status = panel.querySelector<HTMLElement>('.laboratory__status')!;
  const specimens = panel.querySelector<HTMLElement>('.laboratory__specimens')!;
  const fruitTray = panel.querySelector<HTMLElement>('.laboratory__fruit')!;
  const jarContents = panel.querySelector<HTMLElement>('.laboratory__jar-contents')!;
  const mix = panel.querySelector<HTMLButtonElement>('.laboratory__mix')!;
  const returnButton = panel.querySelector<HTMLButtonElement>('.laboratory__return')!;
  const seeds = panel.querySelector<HTMLElement>('.laboratory__seeds')!;
  const selected = new Set<number>();
  let nativeDrag: { index: number; fruit: Fruit } | undefined;
  let renderedSpecimens = '';
  let renderedFruit = '';
  const attemptedContacts = new Set<string>();
  mix.addEventListener('click', () => {
    const ids = [...selected];
    if (ids.length >= 2) options.merge(ids);
  });
  returnButton.addEventListener('click', () => {
    const ids = [...selected];
    if (ids.length) options.returnToCrate(ids);
  });
  jar.addEventListener('dragover', (event) => event.preventDefault());
  jar.addEventListener('drop', (event) => {
    event.preventDefault();
    const index = Number(event.dataTransfer?.getData('text/plain'));
    const dragged = nativeDrag;
    nativeDrag = undefined;
    if (dragged?.index === index) options.store(index, dragged.fruit);
  });
  let disposed = false;
  let dropSpecimen: (id: number) => void = () => {};
  let releaseSpecimen: (id: number) => void = () => {};
  let specimenPose: (id: number) => { x: number; y: number } = () => ({ x: 0, y: 0 });
  let physicsReady = false;
  let stopPhysics = () => {};

  // Rapier is optional presentation only. A failed module load leaves the touch tray usable.
  void import('../physics/laboratory-physics').then(async ({ startLaboratoryPhysics }) => {
    const physics = await startLaboratoryPhysics();
    if (!disposed) {
      dropSpecimen = physics.drop; releaseSpecimen = physics.release; specimenPose = physics.pose; stopPhysics = physics.dispose;
      physicsReady = true;
      for (const { id } of options.getState().labSpecimens) dropSpecimen(id);
    }
    else physics.dispose();
  }).catch(() => { status.textContent = 'Drag fruit into the jar. The lab is in light mode.'; });

  const render = () => {
    const state = options.getState();
    panel.querySelector('.laboratory__crate h2 span')!.textContent = `${state.crate.length} fruit`;
    panel.querySelector<HTMLElement>('.laboratory__empty')!.hidden = state.labSpecimens.length > 0 || state.crate.length > 0 || state.labSeeds.length > 0;
    const specimenSignature = state.labSpecimens.map(({ id }) => id).join(',');
    if (specimenSignature !== renderedSpecimens) {
      renderedSpecimens = specimenSignature;
      specimens.replaceChildren(...state.labSpecimens.map(({ id, fruit }) => {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'laboratory__specimen';
        item.textContent = `${fruit.speciesId.replaceAll('-', ' ')} · ${fruit.mutations.join(', ') || 'plain'}`; item.dataset.specimenId = String(id); return item;
      }));
    }
    for (const item of specimens.querySelectorAll<HTMLButtonElement>('.laboratory__specimen')) {
      item.setAttribute('aria-pressed', String(selected.has(Number(item.dataset.specimenId))));
      item.onclick = () => {
        const id = Number(item.dataset.specimenId);
        if (selected.has(id)) selected.delete(id); else if (selected.size < 3) selected.add(id);
        mix.disabled = selected.size < 2;
        returnButton.disabled = selected.size === 0;
        item.setAttribute('aria-pressed', String(selected.has(id)));
      };
    }
    mix.disabled = selected.size < 2;
    returnButton.disabled = selected.size === 0;
    jarContents.replaceChildren(...state.labSpecimens.map(({ id, fruit }) => {
      const item = document.createElement('span'); item.className = 'laboratory__jar-fruit'; item.dataset.specimenId = String(id); item.dataset.speciesId = fruit.speciesId; item.dataset.mutations = fruit.mutations.join(' '); item.textContent = fruit.speciesId.slice(0, 1).toUpperCase();
      item.setAttribute('aria-label', `${fruit.speciesId.replaceAll('-', ' ')} · ${fruit.mutations.join(', ') || 'plain'}`);
      const { x, y } = specimenPose(id); item.style.left = `${50 + x * 25}%`; item.style.bottom = `${Math.max(2, Math.min(88, 20 + y * 28))}%`;
      return item;
    }));
    if (physicsReady) {
      const positions = new Map(state.labSpecimens.map(({ id }) => [id, specimenPose(id)]));
      const remaining = new Set(positions.keys());
      while (remaining.size) {
        const group = [remaining.values().next().value as number]; remaining.delete(group[0]!);
        for (let index = 0; index < group.length; index += 1) {
          const current = positions.get(group[index]!)!;
          for (const id of remaining) {
            const next = positions.get(id)!;
            if (Math.hypot(current.x - next.x, current.y - next.y) <= 0.62) { group.push(id); remaining.delete(id); }
          }
        }
        if (group.length > 1) {
          const ordered = group.sort((a, b) => a - b); const key = ordered.join(':');
          if (!attemptedContacts.has(key)) { attemptedContacts.add(key); options.merge(ordered); }
        }
      }
    }
    const fruitSignature = state.crate.map((fruit) => `${fruit.speciesId}:${fruit.mutations.join(',')}:${fruit.size}`).join('|');
    if (fruitSignature !== renderedFruit) {
      renderedFruit = fruitSignature;
      fruitTray.replaceChildren(...state.crate.map((fruit, index) => {
      const item = document.createElement('button'); item.type = 'button'; item.className = 'laboratory__fruit-card';
      item.draggable = true;
      item.textContent = `${fruit.speciesId.replaceAll('-', ' ')} · ${fruit.mutations.join(', ') || 'plain'}`;
      let dragged = false;
      const transfer = () => {
        if (item.dataset.transferred) return;
        item.dataset.transferred = 'true'; options.store(index, fruit); status.textContent = 'Fruit dropped into the jar.';
      };
      item.addEventListener('click', () => { if (dragged) { dragged = false; return; } transfer(); });
      item.addEventListener('dragstart', (event) => { nativeDrag = { index, fruit }; event.dataTransfer?.setData('text/plain', String(index)); });
      item.addEventListener('dragend', () => { nativeDrag = undefined; });
      item.addEventListener('pointerdown', (event) => {
        const pointerId = event.pointerId;
        const move = (next: PointerEvent) => {
          if (next.pointerId !== pointerId) return;
          dragged ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) > 8;
          item.style.transform = `translate(${next.clientX - event.clientX}px, ${next.clientY - event.clientY}px)`;
        };
        const up = (next: PointerEvent) => {
          if (next.pointerId !== pointerId) return;
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
          item.style.transform = '';
          const bounds = jar.getBoundingClientRect();
          if (next.clientX >= bounds.left && next.clientX <= bounds.right && next.clientY >= bounds.top && next.clientY <= bounds.bottom) transfer();
        };
        const cancel = () => { item.style.transform = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
        try { item.setPointerCapture(pointerId); } catch { /* Window listeners keep drags working when capture is unavailable. */ }
      });
      return item;
      }));
    }
    seeds.replaceChildren(...state.labSeeds.map((seed) => {
      const item = document.createElement('span'); item.className = 'laboratory__seed'; item.textContent = `${seed.replace('-', ' ')} seed packet`; return item;
    }));
  };
  render();
  const timer = window.setInterval(render, 200);
  close.addEventListener('click', options.close);
  const dispose = () => { if (disposed) return; disposed = true; stopPhysics(); clearInterval(timer); panel.close(); panel.remove(); };
  return Object.assign(dispose, { report(events: readonly SimEvent[]) {
    for (const event of events) {
    if (event.type === 'LabSpecimenStored') dropSpecimen(event.specimenId);
    else if (event.type === 'LabMergeCompleted') {
      event.specimens.forEach(releaseSpecimen);
      selected.clear(); status.textContent = `${event.seedId === 'prism-fig' ? 'Prism Fig' : 'Sunburst'} seed packet ready${event.chainLength > 1 ? ` · Chain ×${event.chainLength}` : ''}.`;
      const keyframes: Keyframe[] = matchMedia('(prefers-reduced-motion: reduce)').matches
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: 'scale(1)' }, { transform: 'scale(1.2, .75)' }, { transform: 'scale(0)', opacity: 0 }];
      for (const id of event.specimens) jarContents.querySelector<HTMLElement>(`[data-specimen-id="${id}"]`)?.animate(keyframes, { duration: 300, easing: 'ease-in' });
      jar.animate(matchMedia('(prefers-reduced-motion: reduce)').matches
        ? [{ opacity: 0.7 }, { opacity: 1 }]
        : [{ boxShadow: '0 0 0 0 transparent', transform: 'scale(1)' }, { boxShadow: '0 0 0 12px color-mix(in srgb, var(--mg-ui-focus) 45%, transparent)', transform: 'scale(.94)' }, { boxShadow: '0 0 0 20px transparent', transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'ease-out' });
    } else if (event.type === 'LabSpecimensReturned') {
      event.specimens.forEach(releaseSpecimen); selected.clear(); status.textContent = 'Fruit returned to the crate.';
    } else if (event.type === 'LabReturnRejected') {
      status.textContent = event.reason === 'crate-full' ? 'The crate is full. Sell fruit in the garden, then return here.' : 'Select fruit to return.';
    } else if (event.type === 'LabSpecimenRejected') {
      fruitTray.querySelectorAll<HTMLElement>('[data-transferred]').forEach((item) => delete item.dataset.transferred);
      status.textContent = event.reason === 'laboratory-full' ? 'The jar is full. Mix specimens or close the lab.' : 'That fruit is no longer in the crate.';
    } else if (event.type === 'LabMergeRejected') {
      status.textContent = event.reason === 'seed-tray-full' ? 'Seed tray full. Plant a lab seed first.' : "Doesn't mix. Both specimens are back in the tray.";
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (const item of jarContents.querySelectorAll<HTMLElement>('.laboratory__jar-fruit')) item.animate([
          { transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' },
        ], { duration: 220, easing: 'ease-out' });
      }
    }
    }
  } });
}
