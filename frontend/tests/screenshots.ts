// Drives the static web export through the main journey and saves screenshots.
// Usage: npm run build:web && (serve dist on :8090) && npx tsx tests/screenshots.ts [baseUrl]
import { chromium, type Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const OUT = path.resolve(__dirname, '../../docs/frontend/screenshots');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log('saved', name);
}

async function journey(page: Page, prefix: string) {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText('Your fields').first().waitFor();
  await shot(page, `${prefix}-01-fields`);

  await page.getByRole('button', { name: 'Open' }).first().click();
  await page.getByText('DEMO RESULT').waitFor();
  await shot(page, `${prefix}-02-result-demo`);

  await page.getByRole('tab', { name: 'New check' }).click();
  await page.getByRole('radio', { name: /Hillside coffee/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Looked under the leaves' }).click();
  await shot(page, `${prefix}-03-check-evidence`);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Save check' }).click();
  await page.getByText('Choose at least one option.').waitFor();
  await page.getByRole('checkbox', { name: /Orange-yellow/ }).click();
  await page.getByRole('radio', { name: 'Sure', exact: true }).click();
  await shot(page, `${prefix}-04-check-symptoms`);
  await page.getByRole('button', { name: 'Save check' }).click();
  await page.getByText('DEMO RESULT').waitFor();
  await page.getByRole('radio', { name: 'In 7 days' }).click();
  await shot(page, `${prefix}-05-new-result`);

  await page.getByRole('tab', { name: 'History' }).click();
  await shot(page, `${prefix}-06-history`);

  // Persistence: reload and confirm the saved check survives.
  await page.reload();
  await page.getByRole('tab', { name: 'History' }).click();
  const count = await page.getByText(/3 checks saved on this phone/).count();
  if (!count) throw new Error('saved check did not survive reload');

  // Server mode with no backend: unreachable state, check stays local and pending.
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Server/ }).click();
  await page.getByRole('textbox', { name: 'Server address' }).fill('http://127.0.0.1:9');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByText(/Could not connect/).waitFor();
  await shot(page, `${prefix}-07-settings-unreachable`);
  await page.getByRole('tab', { name: 'New check' }).click();
  await page.getByRole('radio', { name: /Valley coffee/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Leaves turning yellow' }).click();
  await page.getByRole('button', { name: 'Save check' }).click();
  await page.getByText('No connection to the server').waitFor();
  await shot(page, `${prefix}-08-pending-offline`);

  // Unsupported locale fallback + French.
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Built-in demo/ }).click();
  await page.getByRole('radio', { name: /Kinyarwanda/ }).click();
  await page.getByRole('tab', { name: 'Fields' }).click();
  await shot(page, `${prefix}-09-locale-fallback`);
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /Français/ }).click();
  await page.getByRole('tab', { name: 'Parcelles' }).click();
  await shot(page, `${prefix}-10-fields-fr`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const errors: string[] = [];
  for (const [prefix, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]] as const) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${prefix}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/127\.0\.0\.1:9|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(`${prefix}: ${m.text()}`); });
    try { await journey(page, prefix); } catch (e) { await page.screenshot({ path: path.join(OUT, `FAIL-${prefix}.png`), fullPage: true }); throw e; }
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('Journey passed with no console errors');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
