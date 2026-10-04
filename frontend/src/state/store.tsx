// React binding for app state. Views call these actions; they never touch storage or fetch.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { httpApi, mockApi, type Api } from '../api';
import { ConnectionGate, type Connection } from './connection';
import { buildObservation, newId, type Field, type ObservationRecord } from '../domain/model';
import { translator, type Translate } from '../i18n';
import { deviceStore, type KeyValueStore } from '../storage';
import { loadState, retryable, runAnalysis, saveState, seedState, type PersistedState, type Settings } from './repository';

export type { Connection };

interface NewCheck { fieldId: string; symptoms: string[]; certainty: 'sure' | 'unsure'; evidence: string[]; photoUri?: string; note?: string }

interface Store {
  ready: boolean; recovered: boolean; storageError?: string;
  state: PersistedState; api: Api; connection: Connection; t: Translate;
  busy: Record<string, boolean>;
  addField(name: string, crop: string): Promise<Field>;
  saveCheck(input: NewCheck): Promise<ObservationRecord>;
  retry(recordId: string): Promise<void>;
  toggleScouting(recordId: string, scoutingId: string): void;
  setFollowUp(recordId: string, days: number | undefined): void;
  updateSettings(patch: Partial<Settings>): void;
  testConnection(baseUrl?: string): Promise<Connection>;
  reset(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);
// One adapter instance per address, so a Test-button check verifies the same instance the store uses.
const httpApis = new Map<string, Api>();
export function apiForUrl(url: string): Api {
  let a = httpApis.get(url);
  if (!a) { a = httpApi(url); httpApis.set(url, a); }
  return a;
}
const EMPTY: PersistedState = { version: 1, fields: [], records: [], settings: { locale: 'en', source: 'mock', baseUrl: 'http://localhost:8000' } };

export function StoreProvider({ children, storage = deviceStore }: { children: React.ReactNode; storage?: KeyValueStore }) {
  const [state, setState] = useState<PersistedState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [storageError, setStorageError] = useState<string>();
  const [connection, setConnection] = useState<Connection>({ kind: 'local' });
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const current = useRef(state);
  const gate = useRef(new ConnectionGate());
  const activeApi = useRef<Api>(mockApi);
  const writes = useRef(Promise.resolve());

  const api = useMemo<Api>(() => state.settings.source === 'http' ? apiForUrl(state.settings.baseUrl) : mockApi, [state.settings.source, state.settings.baseUrl]);
  const t = useMemo(() => translator(state.settings.locale), [state.settings.locale]);
  activeApi.current = api;

  /** Apply an update and queue a durable write; resolves once written. */
  const commit = useCallback((update: (s: PersistedState) => PersistedState) => {
    const next = update(current.current);
    current.current = next;
    setState(next);
    const write = writes.current.then(() => saveState(storage, next)).then(() => setStorageError(undefined), e => setStorageError(String(e?.message ?? e)));
    writes.current = write;
    return write;
  }, [storage]);

  const patchRecord = useCallback((id: string, patch: (r: ObservationRecord) => ObservationRecord) =>
    commit(s => ({ ...s, records: s.records.map(r => r.id === id ? patch(r) : r) })), [commit]);

  useEffect(() => {
    let alive = true;
    loadState(storage, mockApi).then(({ state: loaded, recovered: rec }) => {
      if (!alive) return;
      current.current = loaded; setState(loaded); setRecovered(rec); setReady(true);
      saveState(storage, loaded).catch(e => setStorageError(String(e?.message ?? e)));
    });
    return () => { alive = false; };
  }, [storage]);

  const analyse = useCallback(async (record: ObservationRecord, using: Api) => {
    setBusy(b => ({ ...b, [record.id]: true }));
    const result = await runAnalysis(record, using);
    setBusy(b => { const next = { ...b }; delete next[record.id]; return next; });
    await patchRecord(record.id, r => ({ ...r, analysis: result }));
    // Only the adapter that is still active may change the connection banner.
    if (using.kind === 'http' && using === activeApi.current && result.kind === 'failed' && (result.code === 'network_unavailable' || result.code === 'timeout')) {
      gate.current.invalidate();
      setConnection({ kind: 'unreachable', message: result.message });
    }
  }, [patchRecord]);

  /** Checks the active adapter (or an explicit address, for display only — never verified for retries). */
  /** Probes the active adapter, or the adapter for an explicit address (the one the store will adopt). */
  const testConnection = useCallback(async (baseUrl?: string): Promise<Connection> => {
    const target = baseUrl ? apiForUrl(baseUrl) : api;
    if (target.kind === 'mock') { const c: Connection = { kind: 'local' }; setConnection(c); return c; }
    setConnection({ kind: 'checking' });
    const result = await gate.current.check(target);
    if (result) setConnection(result);
    return result ?? { kind: 'checking' };
  }, [api]);

  // When a working connection appears, retry saved checks that never got an analysis.
  const retryPending = useCallback(() => {
    if (!gate.current.isVerified(api)) return;
    for (const r of current.current.records) if (retryable(r) && !busy[r.id]) analyse(r, api);
  }, [analyse, api, busy]);

  // Probe the saved server once at launch. Later source/address changes are NOT probed
  // automatically (no request to a half-typed or default address); the user taps Test.
  const probedAtLaunch = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!probedAtLaunch.current) { probedAtLaunch.current = true; testConnection(); return; }
    if (!gate.current.adopt(api)) setConnection(api.kind === 'mock' ? { kind: 'local' } : { kind: 'unverified' });
  }, [ready, api]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only a verified server connection triggers automatic retries; failed server checks are
  // never silently re-run through the demo adapter (a manual retry in demo mode is explicit).
  useEffect(() => { if (ready && connection.kind === 'ok') retryPending(); }, [ready, connection.kind, api]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const online = () => { testConnection(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [testConnection]);

  const store: Store = {
    ready, recovered, storageError, state, api, connection, t, busy,
    async addField(name, crop) {
      const field: Field = { id: newId('field'), name: name.trim(), crop, demo: false };
      await commit(s => ({ ...s, fields: [...s.fields, field] }));
      return field;
    },
    async saveCheck(input) {
      const field = current.current.fields.find(f => f.id === input.fieldId);
      if (!field) throw new Error('Unknown field');
      const now = new Date();
      const id = newId('obs', now.getTime());
      const observation = buildObservation({ id, field, symptoms: input.symptoms, certainty: input.certainty, locale: current.current.settings.locale, now, hasPhoto: !!input.photoUri });
      const record: ObservationRecord = { id, fieldId: field.id, createdAt: now.toISOString(), observation, symptoms: input.symptoms, certainty: input.certainty, evidence: input.evidence, photoUri: input.photoUri, note: input.note?.trim() || undefined, analysis: { kind: 'waiting' }, completedScouting: [] };
      await commit(s => ({ ...s, records: [record, ...s.records] }));   // durable local save first
      analyse(record, api);                                               // then request analysis
      return record;
    },
    async retry(recordId) {
      const record = current.current.records.find(r => r.id === recordId);
      if (record) await analyse(record, api);
    },
    toggleScouting(recordId, scoutingId) {
      patchRecord(recordId, r => ({ ...r, completedScouting: r.completedScouting.includes(scoutingId) ? r.completedScouting.filter(x => x !== scoutingId) : [...r.completedScouting, scoutingId] }));
    },
    setFollowUp(recordId, days) { patchRecord(recordId, r => ({ ...r, followUpDays: days })); },
    updateSettings(patch) { commit(s => ({ ...s, settings: { ...s.settings, ...patch } })); },
    testConnection,
    async reset() {
      const seeded = await seedState(mockApi, current.current.settings);
      await commit(() => seeded);
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
