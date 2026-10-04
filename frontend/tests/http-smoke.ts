// Real HTTP journey: web export (served on a CORS-allowed origin) → running FastAPI backend.
// Usage: backend on :8000, `dist` served on :8081, then `npx tsx tests/http-smoke.ts`.
import { chromium } from 'playwright-core';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:8081';
const API = process.argv[3] ?? 'http://localhost:8000';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve(__dirname, '../../docs/frontend/screenshots');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const posts: number[] = [];
  const bodies: string[] = [];
  page.on('response', r => { if (r.url().startsWith(`${API}/v1/analyses`)) posts.push(r.status()); });
  page.on('request', r => { if (r.url().startsWith(`${API}/v1/analyses`) && r.method() === 'POST') bodies.push(r.postData() ?? ''); });
  await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Server/ }).click();
  await page.getByRole('textbox', { name: 'Server address' }).fill(API);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByText(/Connected\. Contract 0\.1\.0/).waitFor({ timeout: 10000 });
  await page.getByRole('tab', { name: 'New check' }).click();
  await page.getByRole('radio', { name: /Hillside coffee/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: /Orange-yellow/ }).click();
  await page.getByRole('textbox', { name: 'Note (optional)' }).fill('PRIVATE-NOTE-123');
  await page.getByRole('button', { name: 'Save check' }).click();
  await page.getByText(/DEMO RESULT|SERVER ESTIMATE/).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Details and data origin/ }).click();
  const body = await page.locator('body').innerText();
  await page.screenshot({ path: path.join(OUT, 'phone-11-http-result.png') });
  if (!posts.includes(200)) throw new Error(`expected a 200 POST /v1/analyses, saw ${posts}`);
  if (!/SERVER · /.test(body)) throw new Error('server mode banner missing');
  const sent = bodies.join('\n');
  if (/PRIVATE-NOTE-123|data:image/.test(sent)) throw new Error('note or photo leaked into the analysis request');
  if (!/"adapter":"farmer-report"/.test(sent)) throw new Error('farmer-report observation not sent');
  for (const expected of [/agri-backend/, /Where to look next/, /Scouting points, in order/, /Is the weather favourable/, /Sent to the server to get this result/, /SERVER ESTIMATE/, /Based on your symptom report/]) {
    if (!expected.test(body)) throw new Error(`missing in result: ${expected}`);
  }
  await page.getByText('Where to look next').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(OUT, 'phone-12-http-map.png') });
  console.log('HTTP smoke passed: POST /v1/analyses', posts, '— agri-backend result with map/weather rendered; no note/photo in request');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
