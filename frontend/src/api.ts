// Canonical API 0.1.0 client boundary. Views consume `Api` only; mock and HTTP stay independent.
import observationFixture from '../../shared/fixtures/observation.json';
import analysisFixture from '../../shared/fixtures/analysis.json';

export const CONTRACT_VERSION = '0.1.0';
export type DataMode = 'demo' | 'live' | 'cached';
export interface Provenance { adapter: string; source: string; [extra: string]: unknown }
export interface Signal { label: string; confidence: number; [extra: string]: unknown }
export interface Observation {
  contract_version: string; id: string; data_mode: DataMode; provenance: Provenance;
  observed_at: string; crop: string; locale?: string;
  location?: { latitude: number; longitude: number };
  signals: Signal[]; [extra: string]: unknown;
}
export type AnalysisStatus = 'supported' | 'needs_review' | 'unsupported' | 'unavailable';
export type Freshness = 'fresh' | 'stale' | 'unavailable';
export interface MapFeature {
  type?: string; geometry?: { type: string; coordinates: unknown } | null;
  properties?: Record<string, unknown> | null; [extra: string]: unknown;
}
export interface Analysis {
  contract_version: string; id: string; data_mode: DataMode; provenance: Provenance;
  observation_id: string; generated_at: string; status: AnalysisStatus;
  condition: { id: string; label: string; confidence: number; uncertainty: string; [extra: string]: unknown };
  environment: { status: Freshness; as_of: string | null; temperature_c: number | null; relative_humidity_pct: number | null; rainfall_mm: number | null; [extra: string]: unknown };
  map: { status: 'available' | 'unavailable' | 'unsupported'; type: 'FeatureCollection'; features: MapFeature[]; limitations: string; [extra: string]: unknown };
  scouting: { id: string; text: string; [extra: string]: unknown }[];
  recommendations: { id: string; text: string; source_ids: string[]; [extra: string]: unknown }[];
  sources: { id: string; title: string; url: string; accessed_at: string; [extra: string]: unknown }[];
  offline: { cached: boolean; stale: boolean; sync_status: 'local_only' | 'pending' | 'synced' | 'failed'; [extra: string]: unknown };
  [extra: string]: unknown;
}
export interface Health { status: string; contract_version: string; data_mode: DataMode }
export interface Api {
  readonly kind: 'mock' | 'http';
  readonly baseUrl?: string;
  analyze(input: Observation): Promise<Analysis>;
  health(): Promise<Health>;
}
export class ApiError extends Error {
  code: string; retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) { super(message); this.code = code; this.retryable = retryable; }
}

export const demoObservation = observationFixture as Observation;
export { demoObservation as observation };

export const mockApi: Api = {
  kind: 'mock',
  async analyze(input) {
    const result = JSON.parse(JSON.stringify(analysisFixture)) as Analysis;
    result.observation_id = input.id;
    if (input.crop !== 'coffee') {
      result.status = 'unsupported';
      result.condition = { id: 'unknown', label: 'Unsupported crop', confidence: 0, uncertainty: 'Bootstrap supports coffee demo only' };
      result.scouting = []; result.recommendations = [];
    }
    return result;
  },
  async health() { return { status: 'ok', contract_version: CONTRACT_VERSION, data_mode: 'demo' }; },
};

const UNAVAILABLE_ENV: Analysis['environment'] = { status: 'unavailable', as_of: null, temperature_c: null, relative_humidity_pct: null, rainfall_mm: null };

/**
 * Defensive bridge for partial server payloads: missing sections become explicit
 * "unavailable" states instead of zero risk. Missing identity fields are rejected.
 */
export function normalizeAnalysis(raw: unknown): Analysis {
  if (!raw || typeof raw !== 'object') throw new ApiError('invalid_response', 'Server returned no analysis.', true);
  const a = raw as Partial<Analysis>;
  if (typeof a.id !== 'string' || typeof a.observation_id !== 'string' || !a.condition || typeof a.condition.label !== 'string')
    throw new ApiError('invalid_response', 'Server analysis is missing required fields.', false);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const env = a.environment;
  return {
    ...a,
    contract_version: a.contract_version ?? 'unknown',
    data_mode: a.data_mode ?? 'demo',
    provenance: a.provenance ?? { adapter: 'unknown', source: 'not reported' },
    generated_at: a.generated_at ?? new Date(0).toISOString(),
    status: a.status ?? 'unavailable',
    condition: {
      ...a.condition,
      id: a.condition.id ?? 'unknown',
      confidence: Math.min(1, Math.max(0, num(a.condition.confidence) ?? 0)),
      uncertainty: a.condition.uncertainty ?? 'Uncertainty not reported.',
    },
    environment: env ? { ...env, status: env.status ?? 'unavailable', as_of: env.as_of ?? null, temperature_c: num(env.temperature_c), relative_humidity_pct: num(env.relative_humidity_pct), rainfall_mm: num(env.rainfall_mm) } : UNAVAILABLE_ENV,
    map: a.map && Array.isArray(a.map.features) ? { ...a.map, status: a.map.status ?? 'unavailable', type: 'FeatureCollection', limitations: a.map.limitations ?? 'Limitations not reported.' } : { status: 'unavailable', type: 'FeatureCollection', features: [], limitations: 'No map returned.' },
    scouting: Array.isArray(a.scouting) ? a.scouting.filter(s => s && typeof s.text === 'string') : [],
    recommendations: Array.isArray(a.recommendations) ? a.recommendations.filter(r => r && typeof r.text === 'string').map(r => ({ ...r, source_ids: Array.isArray(r.source_ids) ? r.source_ids : [] })) : [],
    sources: Array.isArray(a.sources) ? a.sources : [],
    offline: a.offline ?? { cached: false, stale: false, sync_status: 'local_only' },
  } as Analysis;
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ApiError('network_unavailable', 'Connection unavailable; observation kept on this device.', true);
  }
}

export function httpApi(baseUrl: string, timeoutMs = 10000): Api {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    kind: 'http', baseUrl: root,
    async analyze(input) {
      const response = await request(`${root}/v1/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, timeoutMs);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body && typeof body.detail === 'object' && !Array.isArray(body.detail) ? body.detail : {};
        throw new ApiError(detail.code ?? 'http_error', detail.message ?? `HTTP ${response.status}`, detail.retryable ?? response.status >= 500);
      }
      const body = await response.json().catch(() => { throw new ApiError('invalid_response', 'Server response was not JSON.', true); });
      return normalizeAnalysis(body);
    },
    async health() {
      const response = await request(`${root}/v1/health`, { method: 'GET' }, 5000);
      if (!response.ok) throw new ApiError('http_error', `HTTP ${response.status}`, response.status >= 500);
      return response.json() as Promise<Health>;
    },
  };
}
