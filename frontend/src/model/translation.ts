// Localisation layer AFTER the agricultural decision: the canonical analysis is produced once (English
// for languages the engine cannot localise itself), then only its human-readable text is machine-
// translated on the device. IDs, numbers, statuses, severity and risk values are never touched.
import type { Analysis } from '../api';
import type { KeyValueStore } from '../storage';
import { TRANSLATION_MODEL } from './config';
import { WorkerClient, type Progress } from '../runtime/workerClient';

export interface TranslationInfo { target: string; model: string; machine: true; segments: number; ms: number }
export type TranslatedAnalysis = Analysis & { translation?: TranslationInfo };

/** Locales handled by the translation model rather than by the engine's own message catalogs. */
export const needsMachineTranslation = (locale: string) => locale in TRANSLATION_MODEL.languages;

type Translate = (texts: string[]) => Promise<string[]>;

/** Pure: apply a translator to every farmer-facing text field; everything else is copied unchanged. */
export async function translateAnalysisWith(a: Analysis, translate: Translate): Promise<Analysis> {
  const copy: Analysis = JSON.parse(JSON.stringify(a));
  const slots: { get: () => string; set: (v: string) => void }[] = [];
  const add = (obj: any, key: string | number) => { if (obj && typeof obj[key] === 'string' && obj[key].trim()) slots.push({ get: () => obj[key], set: v => { obj[key] = v; } }); };
  const each = (arr: any, key?: string) => Array.isArray(arr) && arr.forEach((x, i) => key ? add(x, key) : add(arr, i));
  add(copy.condition, 'label'); add(copy.condition, 'uncertainty');
  each(copy.condition.differentials, 'label');
  if (copy.condition.severity) add(copy.condition.severity, 'scope');
  each(copy.scouting, 'text'); each(copy.recommendations, 'text');
  (copy.recommendations as any[]).forEach(r => r.regional_scope && add(r.regional_scope, 'note'));
  each(copy.review?.reasons, 'text');
  const wr: any = copy.weather_risk;
  if (wr) { add(wr, 'summary'); add(wr, 'interpretation'); each(wr.limitations); if (wr.climatology) { add(wr.climatology, 'summary'); add(wr.climatology, 'caveat'); } }
  each(copy.regional_context, 'text');
  (copy.regional_context ?? []).forEach((r: any) => r.regional_scope && add(r.regional_scope, 'note'));
  each(copy.guidance_scope?.local_check_required);
  add(copy.map, 'limitations');
  const out = await translate(slots.map(s => s.get()));
  slots.forEach((s, i) => { if (typeof out[i] === 'string' && out[i].trim()) s.set(out[i]); });
  return copy;
}

const client = new WorkerClient('/vlm/translate.worker.js', ['result']);
export const translationAvailable = () => WorkerClient.supported();
export const onTranslationProgress = (fn: (p: Progress) => void) => client.onProgress(fn);
const CACHE_KEY = 'field-companion/translations/v1';

/** Machine-translate an analysis for `locale` with a persistent per-segment cache (works offline once cached). */
export async function translateAnalysis(a: Analysis, locale: string, store: KeyValueStore): Promise<TranslatedAnalysis> {
  const tgt = TRANSLATION_MODEL.languages[locale];
  if (!tgt) return a;
  const t0 = Date.now();
  let cache: Record<string, string> = {};
  try { cache = JSON.parse((await store.getItem(CACHE_KEY)) ?? '{}'); } catch { cache = {}; }
  await client.ready({ config: TRANSLATION_MODEL });
  let segments = 0;
  const translated = await translateAnalysisWith(a, async texts => {
    const out: string[] = [];
    for (const text of texts) {
      const key = `${tgt}|${text}`;
      if (!cache[key]) { cache[key] = (await client.request<{ text: string }>({ type: 'translate', text, src: TRANSLATION_MODEL.sourceLanguage, tgt }, 120000)).text; segments++; }
      out.push(cache[key]);
    }
    return out;
  });
  try { await store.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cache is an optimisation */ }
  return { ...translated, translation: { target: locale, model: TRANSLATION_MODEL.id, machine: true, segments, ms: Date.now() - t0 } };
}
