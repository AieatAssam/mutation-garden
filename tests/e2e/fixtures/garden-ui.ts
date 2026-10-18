import { createGardenUI } from '../../../src/ui/garden-ui';

const selectionEvents = document.querySelector<HTMLOListElement>('#selections');
const root = document.querySelector<HTMLElement>('#garden');
if (!selectionEvents || !root) throw new Error('Garden UI fixture is missing its mount points.');

createGardenUI(root, {
  species: [{ id: 'sunny-sprout', name: 'Sunny Sprout' }],
  selectedId: 'sunny-sprout',
  coins: 12,
  onSelect: (speciesId) => {
    const event = document.createElement('li');
    event.textContent = speciesId;
    selectionEvents.append(event);
  },
});
