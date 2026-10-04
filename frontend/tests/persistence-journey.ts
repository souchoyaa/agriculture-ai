// Bug D: a failed durable save is shown honestly, can be retried, and survives reload once saved.
// Uses demo mode (no model) so it runs fast. Usage: npx tsx tests/persistence-journey.ts <app-origin>
import { chromium } from 'playwright-core';

const APP = process.argv[2] ?? 'http://localhost:8094';
const KEY = 'field-companion/state/v1';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByTestId('check-field-demo-field-hillside').first().waitFor();
    await page.evaluate(k => { const st = JSON.parse(localStorage.getItem(k)!); st.settings.source = 'mock'; localStorage.setItem(k, JSON.stringify(st)); }, KEY);
    await page.reload();
    // Storage starts refusing writes of the app state (e.g. quota exceeded).
    await page.evaluate(k => {
      const orig = Storage.prototype.setItem;
      (window as any).__restoreStorage = () => { Storage.prototype.setItem = orig; };
      Storage.prototype.setItem = function (key: string, value: string) { if (key === k) throw new DOMException('quota', 'QuotaExceededError'); return orig.call(this, key, value); };
    }, KEY);
    await page.getByTestId('check-field-demo-field-hillside').first().click();
    await page.getByTestId('check-sample-photo').click();
    await page.getByText('Not saved on this phone').first().waitFor({ timeout: 30000 });
    const onPhone = await page.getByText('On this phone', { exact: true }).count();
    if (onPhone) throw new Error('"On this phone" shown although the save failed');
    // Storage recovers; the farmer retries.
    await page.evaluate(() => (window as any).__restoreStorage());
    await page.getByRole('button', { name: 'Try saving again' }).click();
    await page.getByText('Not saved on this phone').first().waitFor({ state: 'detached', timeout: 15000 });
    const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).records.length, KEY);
    await page.reload();
    const after = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).records, KEY);
    if (after.length !== stored || after.some((r: any) => 'saveFailed' in r)) throw new Error('record not durably saved after retry');
    console.log(`Persistence journey passed: failure shown, retry saved ${after.length} records, no transient flag persisted`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
