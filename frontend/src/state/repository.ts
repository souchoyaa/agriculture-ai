// Persisted app state + analysis runner. Pure async functions over KeyValueStore and Api,
// so persistence/offline behaviour is testable without React.
import { ApiError, demoObservation, type Api } from '../api';
import { buildObservation, type AnalysisState, type Field, type ObservationRecord } from '../domain/model';
import type { KeyValueStore } from '../storage';

export const STORAGE_KEY = 'field-companion/state/v1';
export const CORRUPT_KEY = 'field-companion/state/corrupt-backup';

export interface Settings { locale: string; source: 'local' | 'mock' | 'http'; baseUrl: string }
export interface PersistedState { version: 1; fields: Field[]; records: ObservationRecord[]; settings: Settings }

export const DEFAULT_SETTINGS: Settings = { locale: 'en', source: 'local', baseUrl: 'http://localhost:8000' };

export async function runAnalysis(record: ObservationRecord, api: Api, now = new Date()): Promise<AnalysisState> {
  try {
    const analysis = await api.analyze(record.observation);
    if (analysis.observation_id !== record.observation.id)
      return { kind: 'failed', code: 'mismatched_response', message: 'Server answered for a different check.', retryable: true, at: now.toISOString() };
    return { kind: 'done', analysis, via: api.kind };
  } catch (error) {
    if (error instanceof ApiError) return { kind: 'failed', code: error.code, message: error.message, retryable: error.retryable, at: now.toISOString() };
    return { kind: 'failed', code: 'client_error', message: String((error as Error)?.message ?? error), retryable: true, at: now.toISOString() };
  }
}

/** Example data, produced by running the mock adapter — never hand-written results. */
export async function seedState(api: Api, settings: Settings = DEFAULT_SETTINGS): Promise<PersistedState> {
  const fields: Field[] = [
    { id: 'demo-field-hillside', name: 'Hillside coffee', crop: 'coffee', location: demoObservation.location, demo: true },
    { id: 'demo-field-valley', name: 'Valley coffee', crop: 'coffee', location: { latitude: -1.953, longitude: 30.071 }, demo: true },
    { id: 'demo-field-maize', name: 'Lower maize', crop: 'maize', demo: true },
  ];
  const hillside: ObservationRecord = {
    id: demoObservation.id, fieldId: fields[0].id, createdAt: demoObservation.observed_at,
    observation: demoObservation, symptoms: demoObservation.signals.map(s => s.label), certainty: 'unsure',
    evidence: [], analysis: { kind: 'not_requested' }, completedScouting: [],
  };
  const maizeObs = buildObservation({ id: 'demo-maize-001', field: fields[2], symptoms: ['yellow_spots_upper_leaf'], certainty: 'unsure', locale: 'en', now: new Date('2026-09-28T07:30:00Z'), hasPhoto: false });
  maizeObs.data_mode = 'demo';
  const maize: ObservationRecord = {
    id: maizeObs.id, fieldId: fields[2].id, createdAt: maizeObs.observed_at, observation: maizeObs,
    symptoms: ['yellow_spots_upper_leaf'], certainty: 'unsure', evidence: ['daylight'], analysis: { kind: 'not_requested' }, completedScouting: [],
  };
  const records = [hillside, maize];
  for (const r of records) r.analysis = await runAnalysis(r, api);
  return { version: 1, fields, records, settings };
}

export async function loadState(store: KeyValueStore, seedApi: Api): Promise<{ state: PersistedState; recovered: boolean }> {
  let raw: string | null = null;
  try { raw = await store.getItem(STORAGE_KEY); } catch { /* storage unavailable → seed in memory */ }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed?.version === 1 && Array.isArray(parsed.fields) && Array.isArray(parsed.records)) {
        // Interrupted in-flight analyses are not "done": surface them as retryable.
        const records = parsed.records.map(r => r.analysis?.kind === 'waiting'
          ? { ...r, analysis: { kind: 'failed', code: 'interrupted', message: 'Analysis was interrupted.', retryable: true, at: new Date().toISOString() } as AnalysisState }
          : r);
        return { state: { ...parsed, records, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } }, recovered: false };
      }
    } catch { /* fall through */ }
    try { await store.setItem(CORRUPT_KEY, raw); } catch { /* best effort */ }
    return { state: await seedState(seedApi), recovered: true };
  }
  return { state: await seedState(seedApi), recovered: false };
}

export async function saveState(store: KeyValueStore, state: PersistedState): Promise<void> {
  // saveFailed is transient UI state about the write itself; never persist it.
  const records = state.records.map(r => { if (!r.saveFailed) return r; const { saveFailed: _f, ...rest } = r; return rest; });
  await store.setItem(STORAGE_KEY, JSON.stringify({ ...state, records }));
}

export function retryable(record: ObservationRecord): boolean {
  return record.analysis.kind === 'not_requested' || (record.analysis.kind === 'failed' && record.analysis.retryable && record.analysis.code !== 'model_unavailable');
}
