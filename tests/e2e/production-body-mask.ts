import type { Page } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };
type SpeciesId = 'sunny-sprout' | 'bubble-berry' | 'twistroot';
type Input = { speciesId: SpeciesId; plotId: number; stage: Box; crop: Box };

/** Run the browser-side fixture with the app's Vite-resolved Three.js modules. */
export async function captureVisibleBodyMasks(page: Page, input: Input): Promise<{ mature: Uint8Array; harvestable: Uint8Array }> {
  const result = await page.evaluate(async (args) => {
    const modulePath: string = 'http://127.0.0.1:4174/mutation-garden/tests/e2e/production-body-mask-browser.ts';
    const fixture = await import(/* @vite-ignore */ modulePath);
    return fixture.captureVisibleBodyMasksInBrowser(args);
  }, input);
  return result as { mature: Uint8Array; harvestable: Uint8Array };
}
