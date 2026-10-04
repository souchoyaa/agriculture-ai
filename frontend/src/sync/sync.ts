// Periodic synchronisation (intermittent connectivity). When online, refresh regional data for each
// field; when offline, the engine uses the last package. Offline is a normal state, not an error.
//
// Package (AsyncStorage key SYNC_KEY), versioned:
//   { version: 1, last_attempt_at, last_success_at, weather: { "<lat3>_<lon3>": payload }, results: [{ key, ok, error?, at }] }
// `payload` is byte-compatible with the backend weather cache (backend/app/domain/weather.py), so the
// on-device engine consumes it unchanged. Expiry: the backend labels weather fresh for 6 h, then stale;
// stale data is still used and disclosed. Partial sync keeps successful locations.
import type { KeyValueStore } from '../storage';

export const SYNC_KEY = 'field-companion/sync/v1';
export const HOURLY = 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m';
export const AUTO_SYNC_AFTER_H = 6;
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export interface WeatherPayload {
  provider: string; endpoint: string; license: string; fetched_at: string;
  request: { latitude: number; longitude: number; past_days: number; forecast_days: number; timezone: string };
  grid_latitude?: number; grid_longitude?: number; elevation_m?: number; notes: string;
  hourly_units?: unknown; hourly: Record<string, unknown[]>;
}
export interface SyncPackage {
  version: 1;
  last_attempt_at?: string; last_success_at?: string;
  weather: Record<string, WeatherPayload>;
  results: { key: string; ok: boolean; error?: string; at: string }[];
}
export const EMPTY_SYNC: SyncPackage = { version: 1, weather: {}, results: [] };

export const locationKey = (lat: number, lon: number) => `${lat.toFixed(3)}_${lon.toFixed(3)}`;

export async function loadSync(store: KeyValueStore): Promise<SyncPackage> {
  try {
    const raw = await store.getItem(SYNC_KEY);
    const pkg = raw ? JSON.parse(raw) : null;
    return pkg?.version === 1 && pkg.weather ? pkg : EMPTY_SYNC;
  } catch { return EMPTY_SYNC; }
}

export async function fetchWeather(lat: number, lon: number, now: Date, fetchImpl: typeof fetch = fetch, timeoutMs = 15000): Promise<WeatherPayload> {
  const q = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), hourly: HOURLY, past_days: '14', forecast_days: '7', timezone: 'UTC' });
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${OPEN_METEO}?${q}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!raw?.hourly?.time?.length) throw new Error('no hourly data');
    return {
      provider: 'open-meteo', endpoint: OPEN_METEO, license: 'CC BY 4.0 (Open-Meteo.com)',
      fetched_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      request: { latitude: Number(lat.toFixed(3)), longitude: Number(lon.toFixed(3)), past_days: 14, forecast_days: 7, timezone: 'UTC' },
      grid_latitude: raw.latitude, grid_longitude: raw.longitude, elevation_m: raw.elevation,
      notes: 'Open-Meteo model output, not station observations; hours before fetched_at are past-days model data, later hours forecast. Synced by the app.',
      hourly_units: raw.hourly_units, hourly: raw.hourly,
    };
  } finally { clearTimeout(timer); }
}

/** Refresh weather for the given points. Never throws; records per-location success/failure (partial sync). */
export async function syncNow(store: KeyValueStore, points: { latitude: number; longitude: number }[], now = new Date(), fetchImpl: typeof fetch = fetch): Promise<SyncPackage> {
  const pkg = await loadSync(store);
  const next: SyncPackage = { ...pkg, weather: { ...pkg.weather }, last_attempt_at: now.toISOString(), results: [] };
  const unique = [...new Map(points.map(p => [locationKey(p.latitude, p.longitude), p])).entries()];
  for (const [key, p] of unique) {
    try {
      next.weather[key] = await fetchWeather(p.latitude, p.longitude, now, fetchImpl);
      next.results.push({ key, ok: true, at: now.toISOString() });
    } catch (e) {
      next.results.push({ key, ok: false, error: String((e as Error)?.message ?? e), at: now.toISOString() });
    }
  }
  if (next.results.some(r => r.ok)) next.last_success_at = now.toISOString();
  try { await store.setItem(SYNC_KEY, JSON.stringify(next)); } catch { /* keep in-memory result; caller shows storage state */ }
  return next;
}

export interface Freshness { lastSuccessAt?: string; ageHours?: number; forecastUntil?: string; locations: number; failed: number }
/** Quiet freshness summary for the UI. */
export function freshness(pkg: SyncPackage, now = new Date()): Freshness {
  const payloads = Object.values(pkg.weather);
  const lastTimes = payloads.map(p => p.hourly?.time?.at(-1)).filter((t): t is string => typeof t === 'string').sort();
  return {
    lastSuccessAt: pkg.last_success_at,
    ageHours: pkg.last_success_at ? Math.max(0, (now.getTime() - Date.parse(pkg.last_success_at)) / 3600e3) : undefined,
    forecastUntil: lastTimes.length ? lastTimes[0] : undefined,   // earliest end across locations (conservative)
    locations: payloads.length,
    failed: pkg.results.filter(r => !r.ok).length,
  };
}

export const syncDue = (pkg: SyncPackage, now = new Date()) =>
  !pkg.last_attempt_at || (now.getTime() - Date.parse(pkg.last_attempt_at)) / 3600e3 >= AUTO_SYNC_AFTER_H;
