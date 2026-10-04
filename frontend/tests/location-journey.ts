// Real-field location journey in headless Chrome (browser geolocation API, not a device GPS):
// GPS granted → rounded location → server check sends it; GPS denied → manual entry with validation.
// Usage: npx tsx tests/location-journey.ts <app-origin> <api-base>
import { chromium, type Page } from 'playwright-core';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:8092';
const API = process.argv[3] ?? 'http://localhost:8100';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve(__dirname, '../../docs/frontend/screenshots');

async function addField(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Fields' }).click();
  await page.getByRole('button', { name: 'Add a field' }).click();
  await page.getByRole('textbox', { name: 'Field name' }).fill(name);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const failures: string[] = [];
  try {
    // 1) Permission granted, position ≈ demo farm (has cached weather), with sub-100 m precision to check rounding.
    const granted = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: -1.950456, longitude: 30.060789 } });
    const page = await granted.newPage();
    const bodies: string[] = [];
    page.on('request', r => { if (r.url().startsWith(`${API}/v1/analyses`)) bodies.push(r.postData() ?? ''); });
    page.on('console', m => { if (m.type() === 'error') failures.push(`CONSOLE ${m.text()}`); });
    page.on('requestfailed', r => failures.push(`FAILED ${r.url()} ${r.failure()?.errorText}`));
    await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: /^Server/ }).click();
    await page.getByRole('textbox', { name: 'Server address' }).fill(API);
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await page.getByText(/Connected\. Contract 0\.1\.0/).waitFor({ timeout: 10000 });
    await addField(page, 'My upper plot');
    await page.getByRole('button', { name: 'Use my current location' }).click();
    await page.getByText('-1.950, 30.061').waitFor({ timeout: 10000 });
    await page.getByText('From this phone’s location, rounded to about 100 m.').waitFor();
    await page.screenshot({ path: path.join(OUT, 'phone-14-location-gps.png') });
    await page.getByRole('button', { name: 'Save field' }).click();
    await page.getByRole('button', { name: /Check this field: My upper plot/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('checkbox', { name: /Orange-yellow/ }).click();
    await page.getByRole('button', { name: 'Save check' }).click();
    await page.getByText('SERVER ESTIMATE').first().waitFor({ timeout: 15000 });
    const sent = JSON.parse(bodies.at(-1) ?? '{}');
    if (sent.location?.latitude !== -1.95 || sent.location?.longitude !== 30.061) throw new Error(`rounded location not sent: ${JSON.stringify(sent.location)}`);
    if (!/device GPS, rounded/.test(sent.provenance?.source ?? '')) throw new Error('GPS provenance missing');
    const body = await page.locator('body').innerText();
    if (/This is an example field/.test(body)) throw new Error('real field wrongly labelled as example');
    for (const expected of [/Where to look next/, /Is the weather favourable/]) if (!expected.test(body)) throw new Error(`missing ${expected}`);
    await page.getByText('Where to look next').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(OUT, 'phone-15-location-real-field-map.png') });
    await granted.close();

    // 2) Permission denied → message, manual entry validates then saves; field stays usable.
    const denied = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
    const p2 = await denied.newPage();
    await p2.goto(APP); await p2.evaluate(() => localStorage.clear()); await p2.reload();
    await addField(p2, 'Lower plot');
    await p2.getByRole('button', { name: 'Use my current location' }).click();
    await p2.getByText(/Location permission was not given|Location could not be found/).waitFor({ timeout: 20000 });
    await p2.getByRole('button', { name: 'Type coordinates' }).click();
    await p2.getByRole('textbox', { name: /Latitude/ }).fill('95');
    await p2.getByRole('textbox', { name: /Longitude/ }).fill('30');
    await p2.getByRole('button', { name: 'Save location' }).click();
    await p2.getByText('Latitude must be between −90 and 90.').waitFor();
    await p2.getByRole('textbox', { name: /Latitude/ }).fill('-2,10049');
    await p2.getByRole('button', { name: 'Save location' }).click();
    await p2.getByText('-2.100, 30.000').waitFor();
    await p2.screenshot({ path: path.join(OUT, 'phone-16-location-manual.png') });
    await p2.getByRole('button', { name: 'Save field' }).click();
    await p2.reload();
    const stored = await p2.evaluate(() => JSON.parse(localStorage.getItem('field-companion/state/v1') ?? '{}').fields?.find((f: { name: string }) => f.name === 'Lower plot'));
    if (stored?.location?.latitude !== -2.1 || stored?.locationSource !== 'manual') throw new Error(`manual location not persisted: ${JSON.stringify(stored)}`);
    await denied.close();

    if (failures.length) throw new Error('unexpected failures:\n' + failures.join('\n'));
    console.log('Location journey passed: GPS granted (rounded, sent with server check, map+weather), denied → manual entry validated and persisted');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
