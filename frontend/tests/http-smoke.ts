// Real HTTP journey: web export (served on a CORS-allowed origin) → running FastAPI backend.
// Usage: backend on :8000, `dist` served on :8081, then `npx tsx tests/http-smoke.ts`.
import { chromium } from 'playwright-core';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:8094';
const API = process.argv[3] ?? 'http://localhost:8100';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve(__dirname, '../../docs/frontend/screenshots');

(async () => {
  const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-models', { executablePath: CHROME, headless: !process.env.HEADED,
    viewport: { width: 390, height: 844 }, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
  try {
  const page = await ctx.newPage();
  const posts: number[] = [];
  const bodies: string[] = [];
  const failures: string[] = [];
  page.on('requestfailed', r => failures.push(`FAILED ${r.resourceType()} ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) failures.push(`HTTP ${r.status()} ${r.request().resourceType()} ${r.request().method()} ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error') failures.push(`CONSOLE ${m.text()}`); });
  page.on('response', r => { if (r.url().startsWith(`${API}/v1/analyses`)) posts.push(r.status()); });
  page.on('request', r => { if (r.url().startsWith(`${API}/v1/analyses`) && r.method() === 'POST') bodies.push(r.postData() ?? ''); });
  await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Server/ }).click();
  await page.getByRole('textbox', { name: 'Server address' }).fill(API);
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await page.getByText(/Connected\. Contract 0\.1\.0/).waitFor({ timeout: 10000 });
  await page.getByRole('tab', { name: 'Fields' }).click();
  await page.getByTestId('check-field-demo-field-hillside').first().click();
  await page.getByTestId('check-sample-photo').click();
  await page.getByText('What the model saw').waitFor({ timeout: 300000 });
  await page.getByRole('button', { name: /Details and data origin/ }).click();
  const body = await page.locator('body').innerText();
  if (!posts.includes(200)) throw new Error(`expected a 200 POST /v1/analyses, saw ${posts}`);
  const sent = bodies.join('\n');
  if (/data:image/.test(sent)) throw new Error('photo leaked into the analysis request');
  if (!/"adapter":"label-list-vlm"/.test(sent)) throw new Error('canonical model observation not sent');
  for (const expected of [/agri-backend/, /Where to look next/, /SERVER ESTIMATE/]) if (!expected.test(body)) throw new Error(`missing in result: ${expected}`);
  await page.screenshot({ path: path.join(OUT, 'phone-11-http-result.png') });
  if (failures.length) throw new Error('unexpected failed requests in connected journey:\n' + failures.join('\n'));
  console.log('HTTP smoke passed: on-device perception, POST /v1/analyses', posts, '— server analysis rendered; photo never sent');
  } finally { await ctx.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
