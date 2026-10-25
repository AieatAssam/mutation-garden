import { expect, test } from '@playwright/test';
import { SIM_SCHEMA_VERSION, createInitialState } from '../../src/sim';
import { encodeSave } from '../../src/save/codec';

const futureSave = { ...encodeSave(createInitialState(17, 0), 0, 'e2e'), schema: SIM_SCHEMA_VERSION + 1 };

test('long notice stays readable after four seconds and closes on tap', async ({ page }) => {
  await page.addInitScript((save) => {
    const request = indexedDB.open('mutation-garden', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => request.result.transaction('saves', 'readwrite').objectStore('saves').put(save, 'slot-0');
  }, futureSave);
  await page.goto('./');
  const notice = page.locator('.garden-ui__hint');
  await expect(notice).toContainText('This save is from a newer version.');
  await page.waitForTimeout(4_000);
  await expect(notice).toContainText('Progress here will not be saved.');
  await notice.click();
  await expect(notice).not.toContainText('This save is from a newer version.');
});
