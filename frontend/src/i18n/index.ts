// Semantic message ids → localized strings. Unsupported locales fall back to English
// and the UI says so; nothing is presented as translated when it is not.
import { en, type Messages } from './en';
import { fr } from './fr';
import { rw } from './rw';
import { sw } from './sw';

export type MessageId = keyof Messages;
export const LOCALES = [
  { code: 'en', name: 'English', supported: true, machine: false },
  { code: 'fr', name: 'Français', supported: true, machine: false },
  // Interface and results machine-translated on device (NLLB-200); not reviewed by native speakers.
  { code: 'rw', name: 'Ikinyarwanda', supported: true, machine: true },
  { code: 'sw', name: 'Kiswahili', supported: true, machine: true },
] as const;
export type LocaleCode = typeof LOCALES[number]['code'];

const catalogs: Partial<Record<string, Partial<Messages>>> = { en, fr, rw, sw };

export function isMachineTranslated(locale: string): boolean {
  return LOCALES.some(l => l.code === locale && l.machine);
}

export function isSupported(locale: string): boolean {
  return LOCALES.some(l => l.code === locale && l.supported);
}

export type Translate = (id: MessageId, params?: Record<string, string | number>) => string;

export function translator(locale: string): Translate {
  const catalog = catalogs[locale] ?? {};
  return (id, params) => {
    let text = catalog[id] ?? en[id] ?? id;
    if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
}

/** Message ids present in English but missing in a supported catalog (checked in tests). */
export function missingKeys(locale: string): string[] {
  const catalog = catalogs[locale] ?? {};
  return Object.keys(en).filter(k => !(k in catalog));
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try { return d.toLocaleDateString(isSupported(locale) ? locale : 'en', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d.toISOString().slice(0, 10); }
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try { return d.toLocaleString(isSupported(locale) ? locale : 'en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
}
