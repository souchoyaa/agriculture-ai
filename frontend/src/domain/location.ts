// Location handling (pure, testable). Every stored position carries its horizontal uncertainty
// (`accuracy_m`) and how it was obtained (`basis`), so the analysis never claims more spatial
// precision than the position supports (see docs/science/spatial-model.md).
export const STORE_DECIMALS = 5;            // ≈ 1 m: storage precision; real uncertainty is in accuracy_m
export const DISPLAY_DECIMALS = 5;
const M_PER_DEG_LAT = 111_320;
export const MIN_ACCURACY_M = 3;

export type LocationBasis = 'device_gps' | 'manual_entry' | 'field' | 'example';
export interface FieldLocation { latitude: number; longitude: number; accuracy_m?: number; basis?: LocationBasis }

export function roundCoord(value: number, decimals = STORE_DECIMALS): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Rounds coordinates for storage; uncertainty is never reduced by rounding. */
export function roundLocation(loc: FieldLocation): FieldLocation {
  const out: FieldLocation = { latitude: roundCoord(loc.latitude), longitude: roundCoord(loc.longitude) };
  if (loc.accuracy_m != null && Number.isFinite(loc.accuracy_m)) out.accuracy_m = Math.max(MIN_ACCURACY_M, Math.round(loc.accuracy_m));
  if (loc.basis) out.basis = loc.basis;
  return out;
}

/** Uncertainty implied by the number of decimals typed: half a unit of the last digit, in metres. */
export function accuracyFromDecimals(latText: string, lonText: string): number {
  const decimals = (s: string) => (s.trim().replace(',', '.').split('.')[1] ?? '').length;
  const d = Math.min(decimals(latText), decimals(lonText));
  return Math.max(MIN_ACCURACY_M, Math.round((M_PER_DEG_LAT * 10 ** -d) / 2));
}

export type ParseResult = { ok: true; value: FieldLocation } | { ok: false; error: 'missing' | 'not_number' | 'latitude_range' | 'longitude_range' };

/** Accepts "-1.95" or "-1,95" (comma decimal); validates WGS84 ranges; records uncertainty from precision typed. */
export function parseCoordinates(latText: string, lonText: string): ParseResult {
  const clean = (s: string) => s.trim().replace(',', '.');
  const a = clean(latText); const b = clean(lonText);
  if (!a || !b) return { ok: false, error: 'missing' };
  if (!/^[+-]?\d+(\.\d+)?$/.test(a) || !/^[+-]?\d+(\.\d+)?$/.test(b)) return { ok: false, error: 'not_number' };
  const lat = Number(a); const lon = Number(b);
  if (lat < -90 || lat > 90) return { ok: false, error: 'latitude_range' };
  if (lon < -180 || lon > 180) return { ok: false, error: 'longitude_range' };
  return { ok: true, value: roundLocation({ latitude: lat, longitude: lon, accuracy_m: accuracyFromDecimals(a, b), basis: 'manual_entry' }) };
}
