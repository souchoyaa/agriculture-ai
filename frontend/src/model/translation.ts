// Localisation layer AFTER the agricultural decision: the canonical analysis is produced once (English
// for languages the engine cannot localise itself), then only its human-readable text is machine-
// translated on the device. IDs, numbers, statuses, severity and risk values are never touched.
import type { Analysis } from '../api';
import type { KeyValueStore } from '../storage';
import { TRANSLATION_MODEL } from './config';
import { WorkerClient, type Progress } from '../runtime/workerClient';

export * from './translateText';
import { translateAnalysisWith, type TranslatedAnalysis } from './translateText';

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
