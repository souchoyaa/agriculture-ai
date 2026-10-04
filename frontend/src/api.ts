// Canonical API 0.1.0 client boundary. Views consume `Api` only; mock and HTTP stay independent.
import observationFixture from '../../shared/fixtures/observation.json';
import analysisFixture from '../../shared/fixtures/analysis.json';
import unsupportedCropExample from '../../shared/fixtures/examples/unsupported_crop.analysis.json';
import lowConfidenceExample from '../../shared/fixtures/examples/low_confidence.analysis.json';

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
  condition: {
    id: string; label: string; confidence: number; uncertainty: string;
    // Optional backend additions (0.1.0, additive). Absent on older servers.
    abstained?: boolean; confidence_kind?: string; pathogen?: string;
    differentials?: { signal?: string; condition_id: string; label: string; confidence?: number; source_ids?: string[] }[];
    support_blocked_by_differential?: boolean;
    severity?: { affected_leaf_area_pct?: number; level?: number; scale?: string; scope?: string; source_ids?: string[] } | null;
    [extra: string]: unknown;
  };
  environment: { status: Freshness; as_of: string | null; temperature_c: number | null; relative_humidity_pct: number | null; rainfall_mm: number | null; [extra: string]: unknown };
  map: { status: 'available' | 'unavailable' | 'unsupported'; type: 'FeatureCollection'; features: MapFeature[]; limitations: string; [extra: string]: unknown };
  scouting: { id: string; text: string; rank?: number; priority?: number; location?: { latitude: number; longitude: number }; distance_m?: number; source_ids?: string[]; [extra: string]: unknown }[];
  recommendations: { id: string; text: string; source_ids: string[]; regional_scope?: RegionalScope; [extra: string]: unknown }[];
  sources: { id: string; title: string; url: string; accessed_at: string; license?: string; kind?: string; publisher?: string; [extra: string]: unknown }[];
  weather_risk?: WeatherRisk;
  review?: { suggested: boolean; reasons?: { id: string; text: string }[]; requires_user_authorization?: boolean; auto_contact?: boolean };
  localization?: { requested?: string; used?: string; fallback?: boolean; reviewed_by_native_speaker?: boolean; catalog_status?: string };
  regional_context?: { id: string; region?: string; text: string; source_ids?: string[]; regional_scope?: RegionalScope }[];
  guidance_scope?: { applicability?: string; local_check_required?: string[]; regions_of_guidance_sources?: string[] };
  evidence?: { label: string; confidence?: number; recognized?: boolean; specific?: boolean; contribution?: number }[];
  offline: { cached: boolean; stale: boolean; sync_status: 'local_only' | 'pending' | 'synced' | 'failed'; [extra: string]: unknown };
  [extra: string]: unknown;
}
export interface RegionalScope { region_id?: string; match?: string; source_year?: number; note?: string }
export interface WeatherRisk {
  status: 'available' | 'partial' | 'unavailable';
  class?: 'low' | 'moderate' | 'high' | null;
  summary?: string; interpretation?: string; calibrated?: boolean;
  favourable_days?: number; assessed_days?: number; history_days?: number; forecast_days?: number;
  days?: { date: string; favourable?: boolean; complete?: boolean; period?: string }[];
  climatology?: { status?: string; relation?: string; summary?: string; caveat?: string };
  limitations?: string[];
  [extra: string]: unknown;
}
export interface Health {
  status: string; contract_version: string; data_mode: DataMode;
  /** Service capability (backend ≥ 19af16e); never a label for individual analyses. */
  data_mode_scope?: string;
  capabilities?: { image_inference?: string; weather?: string; calibration?: string; persistence?: string; [extra: string]: unknown };
}
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

// Signal labels the backend coffee knowledge base recognises (backend/data/conditions); used
// only to pick between two canned examples so the offline demo can show abstention.
const MOCK_RECOGNIZED = new Set(['orange_powder_leaf_underside', 'rust_like_leaf_marks', 'yellow_spots_upper_leaf', 'lesions_lower_canopy_first', 'premature_leaf_drop', 'brown_dry_lesion_centres']);

export const mockApi: Api = {
  kind: 'mock',
  /** Returns a published backend example verbatim (fixed demo answer; it does not read the report). */
  async analyze(input) {
    const example = input.crop !== 'coffee' ? unsupportedCropExample
      : input.signals.some(s => MOCK_RECOGNIZED.has(s.label)) ? analysisFixture : lowConfidenceExample;
    const result = JSON.parse(JSON.stringify(example)) as Analysis;
    result.observation_id = input.id;
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

/** Portable timeout (AbortController + timer): AbortSignal.timeout is missing on some RN runtimes. */
async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw timedOut
      ? new ApiError('timeout', 'Server did not answer in time; observation kept on this device.', true)
      : new ApiError('network_unavailable', 'Connection unavailable; observation kept on this device.', true);
  } finally {
    clearTimeout(timer);
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
