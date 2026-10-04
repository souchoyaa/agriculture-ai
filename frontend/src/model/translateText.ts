// Pure localisation mapping (no React Native / workers).
import type { Analysis } from '../api';
import { TRANSLATION_MODEL } from './config';

export interface TranslationInfo { target: string; model: string; machine: true; segments: number; ms: number; source_condition_label?: string }
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

