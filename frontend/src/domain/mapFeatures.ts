// Interprets backend-provided GeoJSON features for display only. It never computes risk:
// priority/level/score/time come from the feature properties exactly as the service sent them.
import type { MapFeature } from '../api';

export type FeatureRole = 'cell' | 'reported' | 'scouting_point' | 'other';
export interface FeatureView {
  key: string; role: FeatureRole; label: string;
  level?: string; score?: number; priority?: number; rank?: number; time?: string; present?: boolean;
  center?: [number, number];                  // [longitude, latitude]
  bounds?: [number, number, number, number];  // minLon, minLat, maxLon, maxLat
  properties: Record<string, unknown>;
}

function coordsOf(geometry: MapFeature['geometry']): number[][] {
  const pts: number[][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') { if (Number.isFinite(c[0]) && Number.isFinite(c[1])) pts.push(c as number[]); }
    else if (Array.isArray(c)) c.forEach(walk);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  return pts;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function describeFeatures(features: MapFeature[]): FeatureView[] {
  return features.map((f, i) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const pts = coordsOf(f.geometry);
    const kind = str(p.kind);
    const isArea = f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
    const role: FeatureRole = kind === 'scouting_priority_cell' || (isArea && num(p.priority) !== undefined) ? 'cell'
      : kind === 'reported_observation' ? 'reported' : kind === 'scouting_point' ? 'scouting_point' : 'other';
    const lons = pts.map(c => c[0]); const lats = pts.map(c => c[1]);
    return {
      key: String(f.id ?? p.id ?? `${kind ?? 'f'}-${i}`),
      role,
      label: str(p.label) ?? str(p.name) ?? `#${i + 1}`,
      level: str(p.level) ?? str(p.risk_level) ?? str(p.category),
      score: num(p.score) ?? num(p.suitability),
      priority: num(p.priority),
      rank: num(p.rank),
      present: typeof p.present === 'boolean' ? p.present : undefined,
      time: str(p.valid_at) ?? str(p.time) ?? str(p.valid_from) ?? str(p.horizon),
      center: pts.length ? [lons.reduce((a, b) => a + b, 0) / pts.length, lats.reduce((a, b) => a + b, 0) / pts.length] : undefined,
      bounds: pts.length ? [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] : undefined,
      properties: p,
    };
  });
}

export function timeSlots(views: FeatureView[]): string[] {
  return [...new Set(views.map(v => v.time).filter((t): t is string => !!t))].sort();
}

/** Three display buckets for a backend 0–1 priority; labels stay relative ("lower/higher"). */
export function priorityBucket(p: number): 'low' | 'mid' | 'high' {
  return p >= 0.6 ? 'high' : p >= 0.3 ? 'mid' : 'low';
}

const LEVEL_GLYPH: Record<string, string> = { low: '○', moderate: '◐', medium: '◐', high: '●', very_high: '◉' };
export function levelGlyph(level?: string): string { return (level && LEVEL_GLYPH[level.toLowerCase()]) ?? '◇'; }

/**
 * Equirectangular projection into a unit square, preserving ground aspect (cos latitude)
 * with a margin. Returns x,y in [0,1], y downwards (north up).
 */
export function project(points: [number, number][], margin = 0.06): (p: [number, number]) => { x: number; y: number } {
  const lons = points.map(p => p[0]); const lats = points.map(p => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180) || 1;
  const spanX = Math.max((maxX - minX) * k, 1e-9); const spanY = Math.max(maxY - minY, 1e-9);
  const span = Math.max(spanX, spanY);
  const offX = (span - spanX) / 2; const offY = (span - spanY) / 2;
  const scale = 1 - 2 * margin;
  return ([lon, lat]) => ({
    x: margin + scale * (((lon - minX) * k + offX) / span),
    y: margin + scale * (1 - ((lat - minY) + offY) / span),
  });
}
