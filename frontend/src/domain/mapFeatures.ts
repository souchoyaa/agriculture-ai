// Interprets backend-provided GeoJSON features for display only. It never computes risk:
// level/score/time come from the feature properties exactly as the service sent them.
import type { MapFeature } from '../api';

export interface FeatureView {
  key: string; label: string; level?: string; score?: number; time?: string;
  center?: [number, number]; // [longitude, latitude]
  properties: Record<string, unknown>;
}

function centerOf(geometry: MapFeature['geometry']): [number, number] | undefined {
  if (!geometry || !geometry.coordinates) return undefined;
  const pts: number[][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
  if (!pts.length) return undefined;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : undefined;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

export function describeFeatures(features: MapFeature[]): FeatureView[] {
  return features.map((f, i) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const score = typeof p.score === 'number' ? p.score : typeof p.suitability === 'number' ? p.suitability : undefined;
    return {
      key: String(f.id ?? p.id ?? i),
      label: str(p.label) ?? str(p.name) ?? `#${i + 1}`,
      level: str(p.level) ?? str(p.risk_level) ?? str(p.category),
      score,
      time: str(p.valid_at) ?? str(p.time) ?? str(p.valid_from) ?? str(p.horizon),
      center: centerOf(f.geometry),
      properties: p,
    };
  });
}

export function timeSlots(views: FeatureView[]): string[] {
  return [...new Set(views.map(v => v.time).filter((t): t is string => !!t))].sort();
}

const LEVEL_GLYPH: Record<string, string> = { low: '○', moderate: '◐', medium: '◐', high: '●', very_high: '◉' };
export function levelGlyph(level?: string): string { return (level && LEVEL_GLYPH[level.toLowerCase()]) ?? '◇'; }

export function project(points: [number, number][]): (p: [number, number]) => { x: number; y: number } {
  const lons = points.map(p => p[0]); const lats = points.map(p => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const spanX = maxX - minX || 1e-3; const spanY = maxY - minY || 1e-3;
  return ([lon, lat]) => ({ x: 0.1 + 0.8 * (lon - minX) / spanX, y: 0.1 + 0.8 * (1 - (lat - minY) / spanY) });
}
