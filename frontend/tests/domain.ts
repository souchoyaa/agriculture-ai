// Domain, persistence/offline, adapter-error and localization checks (node, no React).
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import observationSchema from '../../shared/contracts/observation.schema.json';
import analysisSchema from '../../shared/contracts/analysis.schema.json';
import analysisFixture from '../../shared/fixtures/analysis.json';
import { ApiError, httpApi, mockApi, normalizeAnalysis, type Api, type Analysis } from '../src/api.ts';
import { buildObservation, fieldAttention, signalStrength, sortFieldsByAttention, SYMPTOMS, EVIDENCE_CHECKS, type ObservationRecord } from '../src/domain/model.ts';
import { describeFeatures, priorityBucket, project, timeSlots } from '../src/domain/mapFeatures.ts';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CORRUPT_KEY, loadState, runAnalysis, saveState, seedState, STORAGE_KEY, retryable } from '../src/state/repository.ts';
import { memoryStore } from '../src/storageMemory.ts';
import { ConnectionGate } from '../src/state/connection.ts';
import { isAppOwnedPhoto } from '../src/photoPaths.ts';
import { parseCoordinates, roundLocation } from '../src/domain/location.ts';
import { isSupported, missingKeys, translator } from '../src/i18n/index.ts';
import { en } from '../src/i18n/en.ts';
import { fr } from '../src/i18n/fr.ts';

const ajv = new Ajv({ strict: false }); addFormats(ajv);
const validObservation = ajv.compile(observationSchema);
const validAnalysis = ajv.compile(analysisSchema);
const tests: [string, () => Promise<void> | void][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);
const withFetch = async (impl: typeof fetch, fn: () => Promise<void>) => {
  const original = globalThis.fetch; globalThis.fetch = impl;
  try { await fn(); } finally { globalThis.fetch = original; }
};
const field = { id: 'f1', name: 'Test', crop: 'coffee', location: { latitude: -1.9, longitude: 30.1 }, demo: false };

test('farmer report builds a schema-valid canonical observation', () => {
  const obs = buildObservation({ id: 'o1', field, symptoms: ['rust_like_leaf_marks', 'none_visible'], certainty: 'sure', locale: 'fr', now: new Date('2026-10-04T08:00:00Z'), hasPhoto: true });
  assert(validObservation(obs), JSON.stringify(validObservation.errors));
  assert.equal(obs.signals.length, 1);
  assert.equal(obs.signals[0].origin, 'farmer_report');
  assert.match(obs.provenance.source, /not analysed/);
  const noLoc = buildObservation({ id: 'o2', field: { ...field, location: undefined }, symptoms: [], certainty: 'unsure', locale: 'en', now: new Date(), hasPhoto: false });
  assert(!('location' in noLoc), 'location must be omitted, not invented');
  assert(validObservation(noLoc));
});

test('mock analysis of a farmer report is schema-valid and echoes the id', async () => {
  const obs = buildObservation({ id: 'o3', field, symptoms: ['yellow_spots_upper_leaf'], certainty: 'unsure', locale: 'en', now: new Date(), hasPhoto: false });
  const result = await mockApi.analyze(obs);
  assert(validAnalysis(result)); assert.equal(result.observation_id, 'o3'); assert.equal(result.data_mode, 'demo');
});

test('normalizeAnalysis turns missing sections into explicit unavailable states', () => {
  const partial = { id: 'a', observation_id: 'o', condition: { label: 'X' } };
  const n = normalizeAnalysis(partial);
  assert.equal(n.status, 'unavailable');
  assert.equal(n.environment.status, 'unavailable');
  assert.equal(n.map.status, 'unavailable');
  assert.deepEqual(n.scouting, []); assert.deepEqual(n.sources, []);
  assert.equal(n.condition.confidence, 0);
  assert.throws(() => normalizeAnalysis({ id: 'a' }), (e: ApiError) => e.code === 'invalid_response');
  assert.deepEqual(normalizeAnalysis(analysisFixture), analysisFixture, 'valid payload passes through unchanged');
});

test('HTTP adapter maps error envelopes without inventing analyses', async () => {
  const obs = buildObservation({ id: 'o4', field, symptoms: [], certainty: 'unsure', locale: 'en', now: new Date(), hasPhoto: false });
  const api = httpApi('http://example.invalid/');
  await withFetch(async () => new Response(JSON.stringify({ detail: { code: 'invalid_observation', message: 'bad', retryable: false } }), { status: 422 }), async () => {
    await assert.rejects(api.analyze(obs), { code: 'invalid_observation', retryable: false });
  });
  await withFetch(async () => new Response(JSON.stringify({ detail: [{ loc: ['body'], msg: 'x' }] }), { status: 422 }), async () => {
    await assert.rejects(api.analyze(obs), { code: 'http_error', retryable: false });
  });
  await withFetch(async () => new Response('oops', { status: 503 }), async () => {
    await assert.rejects(api.analyze(obs), { code: 'http_error', retryable: true });
  });
  await withFetch(async () => new Response('not json', { status: 200 }), async () => {
    await assert.rejects(api.analyze(obs), { code: 'invalid_response' });
  });
  let url = '';
  await withFetch(async (u) => { url = String(u); return new Response(JSON.stringify({ status: 'ok', contract_version: '0.1.0', data_mode: 'demo' })); }, async () => {
    assert.equal((await api.health()).status, 'ok');
  });
  assert.equal(url, 'http://example.invalid/v1/health', 'trailing slash normalized');
});

test('offline analysis failure stays failed+retryable; never becomes mock success', async () => {
  const [record] = (await seedState(mockApi)).records;
  const offline: Api = httpApi('http://example.invalid');
  await withFetch(async () => { throw new TypeError('offline'); }, async () => {
    const state = await runAnalysis(record, offline);
    assert.equal(state.kind, 'failed');
    assert(state.kind === 'failed' && state.retryable && state.code === 'network_unavailable');
    assert(retryable({ ...record, analysis: state }));
  });
  const wrongId: Api = { ...mockApi, kind: 'http', analyze: async () => ({ ...(analysisFixture as Analysis), observation_id: 'other' }) };
  const mismatch = await runAnalysis(record, wrongId);
  assert(mismatch.kind === 'failed' && mismatch.code === 'mismatched_response');
});

test('state persists across reloads and interrupted analyses become retryable', async () => {
  const store = memoryStore();
  const { state } = await loadState(store, mockApi);
  assert.equal(state.fields.length, 3);
  assert(state.records.every(r => r.analysis.kind === 'done'), 'seed records analysed by mock adapter');
  const pending: ObservationRecord = { ...state.records[0], id: 'p1', analysis: { kind: 'waiting' } };
  await saveState(store, { ...state, records: [pending, ...state.records], settings: { ...state.settings, locale: 'fr' } });
  const reloaded = await loadState(store, mockApi);
  assert.equal(reloaded.recovered, false);
  assert.equal(reloaded.state.records.length, state.records.length + 1);
  assert.equal(reloaded.state.settings.locale, 'fr');
  const p = reloaded.state.records.find(r => r.id === 'p1')!;
  assert(p.analysis.kind === 'failed' && p.analysis.code === 'interrupted' && p.analysis.retryable);
});

test('corrupt storage is backed up and replaced by example data', async () => {
  const store = memoryStore({ [STORAGE_KEY]: '{not json' });
  const { state, recovered } = await loadState(store, mockApi);
  assert(recovered); assert.equal(store.data[CORRUPT_KEY], '{not json'); assert(state.fields.length > 0);
});

test('attention summary follows backend status and record age only', async () => {
  const { records } = await seedState(mockApi);
  const now = new Date('2026-10-04T12:00:00Z');
  assert.equal(fieldAttention([], now).level, 'unknown');
  assert.equal(fieldAttention([records[0]], now).level, 'act');           // needs_review
  assert.equal(fieldAttention([records[1]], now).reason, 'unsupported');  // maize
  const failed: ObservationRecord = { ...records[0], analysis: { kind: 'failed', code: 'network_unavailable', message: '', retryable: true, at: '' } };
  assert.equal(fieldAttention([failed], now).reason, 'analysis_pending');
  const sorted = sortFieldsByAttention([{ level: 'ok' as const }, { level: 'act' as const }, { level: 'unknown' as const }, { level: 'check' as const }]);
  assert.deepEqual(sorted.map(s => s.level), ['act', 'check', 'unknown', 'ok']);
  assert.equal(signalStrength(0.65), 'moderate');
});

test('map features are displayed as provided; no frontend risk computation', () => {
  const views = describeFeatures([
    { type: 'Feature', geometry: { type: 'Point', coordinates: [30.0, -1.9] }, properties: { label: 'A', level: 'high', valid_at: '2026-10-05T00:00:00Z' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[30, -2], [30.2, -2], [30.2, -1.8], [30, -1.8]]] }, properties: { name: 'B', score: 0.3, valid_at: '2026-10-04T00:00:00Z' } },
    { type: 'Feature', geometry: null, properties: null },
  ]);
  assert.equal(views[0].level, 'high'); assert.equal(views[1].score, 0.3); assert.equal(views[1].level, undefined);
  assert.deepEqual(views[1].center, [30.1, -1.9]); assert.equal(views[2].center, undefined); assert.equal(views[2].label, '#3');
  assert.deepEqual(timeSlots(views), ['2026-10-04T00:00:00Z', '2026-10-05T00:00:00Z']);
  const p = project([[0, 0], [1, 1]], 0);
  const near = (a: { x: number; y: number }, x: number, y: number) => assert(Math.abs(a.x - x) < 1e-3 && Math.abs(a.y - y) < 1e-3, JSON.stringify(a));
  near(p([0, 1]), 0, 0); near(p([1, 0]), 1, 1);
  const tall = project([[0, 60], [1, 61]], 0);   // at 60°N a degree of longitude is half as wide
  const tp = tall([1, 61]); assert(Math.abs(tp.x - 0.746) < 0.005 && tp.y === 0, JSON.stringify(tp));
  const fx = describeFeatures((analysisFixture as Analysis).map.features);
  assert(fx.filter(v => v.role === 'cell').length > 50);
  assert.equal(fx.filter(v => v.role === 'reported').length, 1);
  assert.deepEqual(fx.filter(v => v.role === 'scouting_point').map(v => v.rank), [1, 2, 3, 4, 5]);
  assert.equal(priorityBucket(0.1), 'low'); assert.equal(priorityBucket(0.5), 'mid'); assert.equal(priorityBucket(1), 'high');
});

test('localization: complete French, transparent fallback, ids covered', () => {
  assert.deepEqual(missingKeys('fr'), []);
  assert(!isSupported('rw'));
  assert.equal(translator('rw')('tab.fields'), en['tab.fields']);
  assert.equal(translator('fr')('history.count', { n: 3 }), '3 constats enregistrés sur ce téléphone');
  for (const s of SYMPTOMS) assert(`symptom.${s.id}` in en, s.id);
  for (const e of EVIDENCE_CHECKS) assert(`evidence.${e}` in en, e);
  const ph = (v: string) => (v.match(/\{\w+\}/g) ?? []).sort().join();
  for (const k of Object.keys(en) as (keyof typeof en)[]) assert.equal(ph(fr[k]), ph(en[k]), `placeholders differ for ${k}`);
});

test('stale health responses are discarded after switching source/address', async () => {
  const gate = new ConnectionGate();
  let release!: () => void;
  const slow: Api = { ...httpApi('http://slow.invalid'), health: () => new Promise(r => { release = () => r({ status: 'ok', contract_version: '0.1.0', data_mode: 'demo' }); }) };
  const pending = gate.check(slow);
  // User switches to the demo adapter while the health check is in flight.
  assert.deepEqual(await gate.check(mockApi), { kind: 'local' });
  release();
  assert.equal(await pending, null, 'late response must be ignored');
  assert.equal(gate.isVerified(slow), false);
  assert.equal(gate.isVerified(mockApi), false, 'mock is never verified for automatic retries');
  // Address change: a new adapter instance; only it can be verified.
  const a = httpApi('http://a.invalid'); const b = httpApi('http://b.invalid');
  await withFetch(async () => new Response(JSON.stringify({ status: 'ok', contract_version: '0.1.0', data_mode: 'demo' })), async () => {
    assert.equal((await gate.check(a))?.kind, 'ok');
    assert(gate.isVerified(a));
    gate.invalidate();
    assert(!gate.isVerified(a));
    await gate.check(b);
    assert(gate.isVerified(b) && !gate.isVerified(a));
  });
});

test('timeout path uses a portable abort and reports retryable timeout', async () => {
  const obs = buildObservation({ id: 'o5', field, symptoms: [], certainty: 'unsure', locale: 'en', now: new Date(), hasPhoto: false });
  const hanging: typeof fetch = (_u, init) => new Promise((_r, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await withFetch(hanging, async () => {
    const started = Date.now();
    await assert.rejects(httpApi('http://slow.invalid', 50).analyze(obs), { code: 'timeout', retryable: true });
    assert(Date.now() - started < 2000);
  });
});

test('source-mode copy never claims nothing leaves the device in server mode', () => {
  for (const lang of [en, fr]) {
    assert.match(lang['result.sent.http'], /server|serveur/i);
    assert.doesNotMatch(lang['result.sync'], /not uploaded|non envoyé|nothing/i);
    assert.doesNotMatch(lang['settings.source.http.detail'], /no data|rien/i);
  }
  assert.match(en['result.sent.http'], /photo/);
});

test('mock returns published examples; every example survives normalization unchanged', async () => {
  const base = { field, certainty: 'sure' as const, locale: 'en', now: new Date(), hasPhoto: false };
  const rust = await mockApi.analyze(buildObservation({ ...base, id: 'm1', symptoms: ['orange_powder_leaf_underside'] }));
  assert.equal(rust.condition.id, 'coffee_leaf_rust'); assert.equal(rust.observation_id, 'm1');
  const unknown = await mockApi.analyze(buildObservation({ ...base, id: 'm2', symptoms: ['insect_damage'] }));
  assert.equal(unknown.condition.abstained, true, 'unrecognised report → abstaining example');
  const maize = await mockApi.analyze(buildObservation({ ...base, id: 'm3', field: { ...field, crop: 'maize' }, symptoms: ['yellow_spots_upper_leaf'] }));
  assert.equal(maize.status, 'unsupported');
  for (const r of [rust, unknown, maize]) assert(validAnalysis(r), JSON.stringify(validAnalysis.errors));
  const dir = path.resolve(__dirname, '../../shared/fixtures/examples');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.analysis.json'))) {
    const example = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    assert(validAnalysis(example), f);
    assert.deepEqual(normalizeAnalysis(example), example, `${f} must pass through unchanged`);
  }
  for (const f of readdirSync(dir).filter(f => f.endsWith('.observation.json'))) assert(validObservation(JSON.parse(readFileSync(path.join(dir, f), 'utf8'))), f);
});

test('changing address does not probe; a Test-button check survives adoption', async () => {
  const gate = new ConnectionGate();
  const a = httpApi('http://a.invalid'); const b = httpApi('http://b.invalid');
  let calls = 0;
  await withFetch(async () => { calls++; return new Response(JSON.stringify({ status: 'ok', contract_version: '0.1.0', data_mode: 'cached' })); }, async () => {
    assert.equal(gate.adopt(a), false, 'unprobed adapter is not adopted as verified');
    assert.equal(calls, 0, 'adopting never sends a request');
    const pending = gate.check(b);            // user taps Test for b …
    assert.equal(gate.adopt(b), true);        // … settings update makes b active mid-check
    assert.equal((await pending)?.kind, 'ok');
    assert(gate.isVerified(b)); assert.equal(calls, 1);
    assert.equal(gate.adopt(a), false); assert(!gate.isVerified(b));
  });
});

test('photo cleanup only targets files inside the app-owned photos directory', () => {
  const dir = 'file:///data/user/0/app/files/photos';
  assert(isAppOwnedPhoto(`${dir}/obs-1.jpg`, dir));
  assert(isAppOwnedPhoto(`${dir}/obs-1.jpg`, `${dir}/`));
  for (const other of ['file:///storage/emulated/0/DCIM/photos/img.jpg', 'file:///data/user/0/app/cache/ImagePicker/x.jpg',
    `${dir}-old/x.jpg`, `${dir}/sub/x.jpg`, `${dir}/../secret.jpg`, `${dir}/`, 'content://media/external/images/1', '']) {
    assert(!isAppOwnedPhoto(other, dir), other);
  }
});

test('live reports disclose example-field coordinates in their provenance', () => {
  const args = { id: 'location-origin', field, symptoms: ['yellow_spots_upper_leaf'], certainty: 'sure' as const, locale: 'en', now: new Date(), hasPhoto: false };
  const example = buildObservation({ ...args, field: { ...field, demo: true } });
  assert(validObservation(example));
  assert.equal(example.data_mode, 'live', 'the symptom report is still current');
  assert.match(example.provenance.source, /example field location/);
  assert.doesNotMatch(buildObservation(args).provenance.source, /example field location/);
});

test('field location entry: validation, comma decimals, accuracy from precision, provenance', () => {
  const ok = parseCoordinates('-1,95049', ' 30.06071 ');
  assert(ok.ok && ok.value.latitude === -1.95049 && ok.value.longitude === 30.06071 && ok.value.basis === 'manual_entry');
  assert(ok.ok && ok.value.accuracy_m === 3, 'five decimals → ~0.6 m, floored to the 3 m minimum');
  const coarse = parseCoordinates('-1.95', '30.06');
  assert(coarse.ok && coarse.value.accuracy_m === 557, `two decimals → ~557 m, got ${coarse.ok && coarse.value.accuracy_m}`);
  assert.deepEqual(parseCoordinates('', '30'), { ok: false, error: 'missing' });
  assert.deepEqual(parseCoordinates('abc', '30'), { ok: false, error: 'not_number' });
  assert.deepEqual(parseCoordinates('91', '30'), { ok: false, error: 'latitude_range' });
  assert.deepEqual(parseCoordinates('10', '-181'), { ok: false, error: 'longitude_range' });
  assert.deepEqual(roundLocation({ latitude: 12.3456789, longitude: -98.7654321, accuracy_m: 1.2, basis: 'device_gps' }), { latitude: 12.34568, longitude: -98.76543, accuracy_m: 3, basis: 'device_gps' });
  const base = { id: 'loc', symptoms: ['yellow_spots_upper_leaf'], certainty: 'sure' as const, locale: 'en', now: new Date(), hasPhoto: false };
  const gps = buildObservation({ ...base, field: { ...field, locationSource: 'gps' } });
  assert(validObservation(gps)); assert.match(gps.provenance.source, /device GPS/);
  const none = buildObservation({ ...base, field: { ...field, location: undefined, locationSource: undefined } });
  assert(!('location' in none));
});

test('supported rust evidence never yields "no issue flagged" (bug A regression)', async () => {
  const supported = JSON.parse(readFileSync(path.resolve(__dirname, '../../shared/fixtures/examples/supported_with_history.analysis.json'), 'utf8')) as Analysis;
  assert.equal(supported.status, 'supported');
  const { records } = await seedState(mockApi);
  const rec: ObservationRecord = { ...records[0], analysis: { kind: 'done', analysis: supported, via: 'http' } };
  const att = fieldAttention([rec], new Date(Date.parse(rec.createdAt) + 3600e3));
  assert.equal(att.level, 'act');
  assert.equal(att.reason, 'condition_supported');
  const healthy = { ...supported, condition: { ...supported.condition, id: 'healthy', abstained: false } };
  assert.equal(fieldAttention([{ ...rec, analysis: { kind: 'done', analysis: healthy, via: 'http' } }], new Date(Date.parse(rec.createdAt) + 3600e3)).level, 'ok');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); }
    catch (e) { failed++; console.error(`FAIL ${name}\n`, e); }
  }
  console.log(`${tests.length - failed}/${tests.length} domain checks passed`);
  if (failed) process.exitCode = 1;
})();
