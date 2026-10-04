// Real-field location journey in headless Chrome (browser geolocation API, not a device GPS):
// GPS granted → location stored with its accuracy → photo check → map honours the accuracy;
// GPS denied → manual entry with validation and precision-derived accuracy.
// Usage: PROFILE=.cache/chrome-models npx tsx tests/location-journey.ts <app-origin>
import { chromium, type Page } from 'playwright-core';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://localhost:8092';
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
    // 1) Permission granted, position ≈ demo farm (cached weather there), browser-reported accuracy 8 m.
    const granted = await chromium.launchPersistentContext(process.env.PROFILE ?? '.cache/chrome-models', { executablePath: CHROME, headless: !process.env.HEADED,
      viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: -1.950456, longitude: 30.060789, accuracy: 8 },
      args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
    const page = await granted.newPage();
    page.on('console', m => { if (m.type() === 'error') failures.push(`CONSOLE ${m.text()}`); });
    await page.goto(APP); await page.evaluate(() => localStorage.clear()); await page.reload();
    await addField(page, 'My upper plot');
    await page.getByRole('button', { name: 'Use my current location' }).click();
    await page.getByText('-1.95046, 30.06079').waitFor({ timeout: 10000 });
    await page.getByText(/Known to about 8 m/).waitFor();
    await page.screenshot({ path: path.join(OUT, 'phone-14-location-gps.png') });
    await page.getByRole('button', { name: 'Save field' }).click();
    const field = await page.evaluate(() => JSON.parse(localStorage.getItem('field-companion/state/v1')!).fields.find((f: any) => f.name === 'My upper plot'));
    if (field?.location?.accuracy_m !== 8 || field.location.basis !== 'device_gps') throw new Error(`GPS accuracy not stored: ${JSON.stringify(field?.location)}`);
    await page.getByTestId(`check-field-${field.id}`).first().click();
    await page.getByTestId('check-sample-photo').click();
    await page.getByText('What the model saw').waitFor({ timeout: 300000 });
    const body = await page.locator('body').innerText();
    if (/This is an example field/.test(body)) throw new Error('real field wrongly labelled as example');
    if (!/Location uncertainty \(about 8 m\)/.test(body)) throw new Error('map does not show the 8 m GPS uncertainty');
    await page.getByText('Where to look next').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(OUT, 'phone-15-location-real-field-map.png') });
    await granted.close();

    // 2) Permission denied → message, manual entry validates; accuracy follows the precision typed.
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
    await p2.getByRole('textbox', { name: /Latitude/ }).fill('-2,1005');
    await p2.getByRole('textbox', { name: /Longitude/ }).fill('30.0012');
    await p2.getByRole('button', { name: 'Save location' }).click();
    await p2.getByText('-2.10050, 30.00120').waitFor();
    await p2.screenshot({ path: path.join(OUT, 'phone-16-location-manual.png') });
    await p2.getByRole('button', { name: 'Save field' }).click();
    await p2.reload();
    const stored = await p2.evaluate(() => JSON.parse(localStorage.getItem('field-companion/state/v1') ?? '{}').fields?.find((f: { name: string }) => f.name === 'Lower plot'));
    if (stored?.location?.latitude !== -2.1005 || stored.location.basis !== 'manual_entry' || stored.location.accuracy_m !== 6) throw new Error(`manual location not persisted with accuracy: ${JSON.stringify(stored)}`);
    await denied.close();

    if (failures.length) throw new Error('unexpected failures:\n' + failures.join('\n'));
    console.log('Location journey passed: GPS 8 m stored and honoured by the map; manual entry validated, 4 decimals → 6 m, persisted');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
