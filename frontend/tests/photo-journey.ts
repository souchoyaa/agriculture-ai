// End-to-end automatic flow in Chrome (WebGPU): photo → on-device VLM → backend adapter → Pyodide
// analysis → result. No questionnaire. Optional second phase: network blocked (offline) → same flow.
// Usage: PROFILE=<persistent dir with model cache> npx tsx tests/photo-journey.ts <app-origin> [--offline]
import { chromium, type Page } from 'playwright-core';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:8094';
const OFFLINE = process.argv.includes('--offline');
const OUT = path.resolve(__dirname, '../../docs/frontend/screenshots');

async function check(page: Page, label: string) {
  await page.getByRole('tab', { name: 'Fields' }).click();
  await page.getByRole('button', { name: /Check this field: Hillside coffee/ }).first().click();
  const questionnaire = await page.getByText(/How sure are you\?|What do you see\?/).count();
  if (questionnaire) throw new Error('symptom questionnaire still present');
  await page.getByRole('button', { name: 'Use example photo' }).click();
  await page.getByText('Analysing on this phone').waitFor({ timeout: 20000 });
  const t0 = Date.now();
  await page.getByText('What the model saw').waitFor({ timeout: 300000 });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  const body = await page.locator('body').innerText();
  for (const expected of [/Rust-like orange powder/, /Where to look next/, /Is the weather favourable/, /not fine-tuned/]) if (!expected.test(body)) throw new Error(`${label}: missing ${expected}`);
  await page.screenshot({ path: path.join(OUT, `photo-${label}-result.png`) });
  return seconds;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-models', {
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: !process.env.HEADED,
    viewport: { width: 390, height: 844 }, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
  const errors: string[] = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByText('Your fields').first().waitFor();
    console.log('online check:', await check(page, 'online'), 's');
    if (OFFLINE) {
      // Block every request that is not this app (Hugging Face, Open-Meteo, CDNs): genuinely offline except app shell cache.
      await ctx.route(url => !url.href.startsWith(APP), route => route.abort('internetdisconnected'));
      await page.reload(); await page.getByText('Your fields').first().waitFor();
      console.log('offline check:', await check(page, 'offline'), 's');
    }
    if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    console.log('Photo journey passed', OFFLINE ? '(online + offline)' : '');
  } finally { await ctx.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
