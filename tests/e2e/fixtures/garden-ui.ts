import { createGardenUI } from '../../../src/ui/garden-ui';
import { palette } from '../../../src/render/palette';

const selectionEvents = document.querySelector<HTMLOListElement>('#selections');
const root = document.querySelector<HTMLElement>('#garden');
if (!selectionEvents || !root) throw new Error('Garden UI fixture is missing its mount points.');

const uiColors: Record<string, string> = {
  '--mg-ui-background': palette.ui.background,
  '--mg-ui-panel': palette.ui.panel,
  '--mg-ui-border': palette.ui.border,
  '--mg-ui-text': palette.ui.text,
  '--mg-ui-accent': palette.ui.accent,
  '--mg-ui-accent-pressed': palette.ui['accent-pressed'],
  '--mg-ui-on-accent': palette.ui['text-on-accent'],
  '--mg-ui-misprint': palette.ui['misprint-shadow'],
  '--mg-ui-focus': palette.ui['focus-ring'],
  '--mg-ui-coin-face': palette.ui.coin.face,
  '--mg-ui-coin-rim': palette.ui.coin.rim,
  '--mg-ui-coin-emboss': palette.ui.coin.emboss,
  '--mg-ui-coin-outline': palette.ui.coin.outline,
  '--mg-ui-coin-text': palette.ui['coin-text'],
};
for (const [property, value] of Object.entries(uiColors)) {
  document.documentElement.style.setProperty(property, value);
}

createGardenUI(root, {
  species: [
    { id: 'sunny-sprout', name: 'Sunny Sprout', cost: 1, unlockLevel: 1 },
    { id: 'bubble-berry', name: 'Bubble Berry', cost: 5, unlockLevel: 1 },
    { id: 'twistroot', name: 'Twistroot', cost: 5, unlockLevel: 1 },
    { id: 'puffcap', name: 'Puffcap', cost: 6, unlockLevel: 4 },
    { id: 'lantern-pod', name: 'Lantern Pod', cost: 12, unlockLevel: 6 },
    { id: 'comet-pear', name: 'Comet Pear', cost: 24, unlockLevel: 9 },
    { id: 'clockvine', name: 'Clockvine', cost: 20, unlockLevel: 11 },
    { id: 'dewbell', name: 'Dewbell', cost: 34, unlockLevel: 13 },
  ],
  selectedId: 'sunny-sprout',
  coins: 12,
  onSelect: (speciesId) => {
    const event = document.createElement('li');
    event.textContent = speciesId;
    selectionEvents.append(event);
  },
});
