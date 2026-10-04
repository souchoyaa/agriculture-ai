// Field location handling (pure, testable). Coordinates are rounded before they are stored
// so the app never keeps more precision than field-level scouting needs.
export const LOCATION_DECIMALS = 3; // ≈ 110 m north–south; field-level, not a precise home position

export interface FieldLocation { latitude: number; longitude: number }

export function roundCoord(value: number, decimals = LOCATION_DECIMALS): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function roundLocation(loc: FieldLocation): FieldLocation {
  return { latitude: roundCoord(loc.latitude), longitude: roundCoord(loc.longitude) };
}

export type ParseResult = { ok: true; value: FieldLocation } | { ok: false; error: 'missing' | 'not_number' | 'latitude_range' | 'longitude_range' };

/** Accepts "-1.95" or "-1,95" (comma decimal); validates WGS84 ranges; rounds. */
export function parseCoordinates(latText: string, lonText: string): ParseResult {
  const clean = (s: string) => s.trim().replace(',', '.');
  const a = clean(latText); const b = clean(lonText);
  if (!a || !b) return { ok: false, error: 'missing' };
  if (!/^[+-]?\d+(\.\d+)?$/.test(a) || !/^[+-]?\d+(\.\d+)?$/.test(b)) return { ok: false, error: 'not_number' };
  const lat = Number(a); const lon = Number(b);
  if (lat < -90 || lat > 90) return { ok: false, error: 'latitude_range' };
  if (lon < -180 || lon > 180) return { ok: false, error: 'longitude_range' };
  return { ok: true, value: roundLocation({ latitude: lat, longitude: lon }) };
}
