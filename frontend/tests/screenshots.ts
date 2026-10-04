// Screenshot tour of the photo-first app (phone + desktop). Uses the persistent model profile so the
// real on-device pipeline runs (source 'local'); falls back to demo mode with DEMO=1.
// Usage: PROFILE=.cache/chrome-models npx tsx tests/screenshots.ts [app-origin]
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:8094';
const OUT = path.resolve(__dirname, '../../docs/frontend/screenshots');
const KEY = 'field-companion/state/v1';

async function shot(page: Page, name: string, scrollTo?: string) {
  if (scrollTo) await page.getByText(scrollTo).first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('saved', name);
}

async function tour(page: Page, prefix: string) {
  await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByTestId('check-field-demo-field-hillside').first().waitFor();
  if (process.env.DEMO) { await page.evaluate(k => { const st = JSON.parse(localStorage.getItem(k)!); st.settings.source = 'mock'; localStorage.setItem(k, JSON.stringify(st)); }, KEY); await page.reload(); }
  await shot(page, `${prefix}-01-home`);
  await page.getByTestId('check-field-demo-field-hillside').first().click();
  await shot(page, `${prefix}-02-photo-first`);
  await page.getByTestId('check-sample-photo').click();
  await page.getByText(/What the model saw|DEMO RESULT/).first().waitFor({ timeout: 300000 });
  await shot(page, `${prefix}-03-result`);
  await shot(page, `${prefix}-04-what-to-do`, 'What to do');
  await shot(page, `${prefix}-05-model-saw`, 'What the model saw');
  await shot(page, `${prefix}-06-map`, 'Where to look next');
  const h24 = page.getByRole('radio', { name: 'Next 24 h' });
  if (await h24.count()) { await h24.click(); await shot(page, `${prefix}-07-map-24h`, 'Where to look next'); }
  await shot(page, `${prefix}-08-weather`, 'Is the weather favourable');
  await page.getByRole('tab', { name: 'History' }).click();
  await shot(page, `${prefix}-09-history`);
  await page.getByRole('tab', { name: 'Settings' }).click();
  await shot(page, `${prefix}-10-settings`);
  await shot(page, `${prefix}-11-settings-models`, 'Models on this device');
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-models', {
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: !process.env.HEADED,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
  const errors: string[] = [];
  try {
    for (const [prefix, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]] as const) {
      const page = await ctx.newPage();
      await page.setViewportSize(viewport);
      page.on('pageerror', e => errors.push(`${prefix}: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`${prefix}: ${m.text()}`); });
      try { await tour(page, prefix); } finally { await page.close(); }
    }
  } finally { await ctx.close(); }
  if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('Tour passed with no console errors');
})().catch(e => { console.error(e); process.exitCode = 1; });
