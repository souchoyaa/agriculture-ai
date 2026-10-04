// React binding for app state. Views call these actions; they never touch storage or fetch.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { httpApi, mockApi, type Api } from '../api';
import { ConnectionGate, type Connection } from './connection';
import { buildObservation, newId, type Field, type ObservationRecord } from '../domain/model';
import { roundLocation, type FieldLocation } from '../domain/location';
import { locateIfPermitted } from '../locationService';
import { translator, type Translate } from '../i18n';
import { deviceStore, type KeyValueStore } from '../storage';
import { deletePhoto, persistPhoto, PHOTO_STORAGE_KIND } from '../photoStore';
import { loadState, retryable, runAnalysis, saveState, seedState, type PersistedState, type Settings } from './repository';
import { demoObservation } from '../api';
import { VISION_MODEL } from '../model/config';
import { perceive, type PerceptionResult } from '../model/perception';
import { needsMachineTranslation, translateAnalysis } from '../model/translation';
import { engineAvailable, localEngineApi, observe as engineObserve } from '../engine/localEngine';
import { runAutomaticCheck, type CheckDeps } from '../pipeline/check';
import { EMPTY_SYNC, loadSync, syncDue, syncNow as runSync, type SyncPackage } from '../sync/sync';

export type { Connection };

interface NewCheck { fieldId: string; symptoms: string[]; certainty: 'sure' | 'unsure'; evidence: string[]; photoUri?: string; note?: string }
interface PhotoCheck { fieldId: string; photoUri: string; analyseAnyway?: boolean; replacesId?: string }
/** Example field coordinates also synced so the demo works offline after one sync. */
const DEMO_POINT = { latitude: -1.95, longitude: 30.06 };

interface Store {
  ready: boolean; recovered: boolean; storageError?: string;
  state: PersistedState; api: Api; connection: Connection; t: Translate;
  busy: Record<string, boolean>;
  addField(name: string, crop: string, location?: { value: FieldLocation; source: 'gps' | 'manual' }): Promise<Field>;
  setFieldLocation(fieldId: string, location?: { value: FieldLocation; source: 'gps' | 'manual' }): Promise<void>;
  saveCheck(input: NewCheck): Promise<ObservationRecord>;
  checkPhoto(input: PhotoCheck): Promise<ObservationRecord>;
  sync: SyncPackage; syncing: boolean; syncNow(): Promise<SyncPackage>;
  localAvailable: boolean;
  retry(recordId: string): Promise<void>;
  retrySave(): Promise<boolean>;
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
  const writes = useRef<Promise<void>>(Promise.resolve());

  const [sync, setSync] = useState<SyncPackage>(EMPTY_SYNC);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef<SyncPackage>(EMPTY_SYNC);
  const localAvailable = engineAvailable();
  // On-device engine is the default; platforms without workers (native, for now) fall back to the labelled demo.
  const localApi = useMemo(() => localEngineApi(async () => Object.values(syncRef.current.weather)), []);
  const api = useMemo<Api>(() => state.settings.source === 'http' ? apiForUrl(state.settings.baseUrl)
    : state.settings.source === 'local' && localAvailable ? localApi : mockApi, [state.settings.source, state.settings.baseUrl, localAvailable, localApi]);
  const t = useMemo(() => translator(state.settings.locale), [state.settings.locale]);
  activeApi.current = api;

  /** Apply an update and queue a durable write; resolves once written. */
  const commit = useCallback((update: (s: PersistedState) => PersistedState) => {
    const next = update(current.current);
    current.current = next;
    setState(next);
    // Resolves true only once the state is durably written; false when the write failed.
    const write = writes.current.then(() => saveState(storage, next)).then(
      () => {
        setStorageError(undefined);
        // Everything in memory up to `next` is now on disk: clear transient "not saved" flags.
        if (current.current.records.some(r => r.saveFailed)) {
          const cleared = { ...current.current, records: current.current.records.map(r => r.saveFailed && next.records.some(n => n.id === r.id) ? { ...r, saveFailed: undefined } : r) };
          current.current = cleared; setState(cleared);
        }
        return true;
      },
      e => { setStorageError(String(e?.message ?? e)); return false; });
    writes.current = write.then(() => undefined);
    return write;
  }, [storage]);

  const patchRecord = useCallback((id: string, patch: (r: ObservationRecord) => ObservationRecord) =>
    commit(s => ({ ...s, records: s.records.map(r => r.id === id ? patch(r) : r) })), [commit]);

  useEffect(() => { loadSync(storage).then(p => { syncRef.current = p; setSync(p); }); }, [storage]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const points = current.current.fields.map(f => f.location).filter((l): l is FieldLocation => !!l);
      const pkg = await runSync(storage, [...points, DEMO_POINT]);
      syncRef.current = pkg; setSync(pkg);
      return pkg;
    } finally { setSyncing(false); }
  }, [storage]);

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

  // Periodic sync: when the device is online and the last attempt is older than AUTO_SYNC_AFTER_H.
  useEffect(() => {
    if (!ready) return;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (online && syncDue(syncRef.current)) syncNow();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const online = () => { testConnection(); if (syncDue(syncRef.current)) syncNow(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [testConnection]);

  /** Runs the automatic chain for a saved photo check and records every stage on the record. */
  const runPhotoPipeline = async (id: string, analyseAnyway?: boolean) => {
    const record = current.current.records.find(r => r.id === id);
    const field = record && current.current.fields.find(f => f.id === record.fieldId);
    if (!record || !field || !record.photoUri) return;
    const using = api;
    const local = using.kind === 'local';
    const deps: CheckDeps = local || using.kind === 'http' ? {
      perceive: img => perceive(img),
      observe: (raw, ctx) => engineObserve(raw, ctx),
      analyze: obs => using.analyze(obs),
      translate: (a, loc) => translateAnalysis(a, loc, storage),
      needsTranslation: needsMachineTranslation,
    } : {
      // Demo mode: deterministic, offline, clearly labelled — no model, fixed example answer.
      perceive: async () => ({ raw: { model: 'demo-fixture', model_version: '0', strategy: 'labels', labels: [{ label: 'rust', score: 0.65 }] }, subject: { kind: 'leaf', scores: { leaf: 1, plant: 0, other: 0 } }, device: 'none (demo)', ms: 0 } as PerceptionResult),
      observe: async () => ({ ...JSON.parse(JSON.stringify(demoObservation)), id: record.id, observed_at: record.createdAt }),
      analyze: obs => mockApi.analyze(obs),
      translate: async a => a,
      needsTranslation: () => false,
    };
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const plantLocation = field.demo ? undefined : await locateIfPermitted();
      const outcome = await runAutomaticCheck({ id, observedAt: record.createdAt, field, image: record.photoUri, locale: current.current.settings.locale,
        history: current.current.records, analyseAnyway, plantLocation }, deps, step => { patchRecord(id, r => ({ ...r, pipelineStep: step })); });
      const p = outcome.perception;
      const perception = { model: p.raw.model, displayName: local || using.kind === 'http' ? p.displayName ?? VISION_MODEL.displayName : 'Demo example (no model)', fineTuned: local || using.kind === 'http' ? p.fineTuned ?? VISION_MODEL.fineTuned : false,
        device: p.device, ms: p.ms, labels: p.raw.labels, subject: p.subject };
      if (outcome.kind === 'follow_up') await patchRecord(id, r => ({ ...r, perception, analysis: { kind: 'follow_up', reason: outcome.followUp, at: new Date().toISOString() } }));
      else {
        const { translation, ...analysis } = outcome.analysis as any;
        await patchRecord(id, r => ({ ...r, perception, observation: outcome.observation, analysis: { kind: 'done', analysis, via: using.kind }, ...(translation ? { translation } : {}), pipelineStep: 'done' }));
      }
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      const code = /worker_unsupported|model not loaded|WebGPU|wasm|fetch|Failed to fetch|load/i.test(message) ? 'model_unavailable' : 'pipeline_error';
      await patchRecord(id, r => ({ ...r, analysis: { kind: 'failed', code, message, retryable: true, at: new Date().toISOString() } }));
    } finally {
      setBusy(b => { const next = { ...b }; delete next[id]; return next; });
    }
  };

  const store: Store = {
    ready, recovered, storageError, state, api, connection, t, busy,
    async addField(name, crop, location) {
      const field: Field = { id: newId('field'), name: name.trim(), crop, demo: false,
        ...(location ? { location: roundLocation({ ...location.value, basis: location.value.basis ?? (location.source === 'gps' ? 'device_gps' : 'manual_entry') }), locationSource: location.source } : {}) };
      await commit(s => ({ ...s, fields: [...s.fields, field] }));
      return field;
    },
    async setFieldLocation(fieldId, location) {
      await commit(s => ({ ...s, fields: s.fields.map(f => {
        if (f.id !== fieldId || f.demo) return f;          // example fields keep their labelled example location
        if (!location) { const { location: _l, locationSource: _s, ...rest } = f; return rest; }
        return { ...f, location: roundLocation({ ...location.value, basis: location.value.basis ?? (location.source === 'gps' ? 'device_gps' : 'manual_entry') }), locationSource: location.source };
      }) }));
    },
    async saveCheck(input) {
      const field = current.current.fields.find(f => f.id === input.fieldId);
      if (!field) throw new Error('Unknown field');
      const now = new Date();
      const id = newId('obs', now.getTime());
      const observation = buildObservation({ id, field, symptoms: input.symptoms, certainty: input.certainty, locale: current.current.settings.locale, now, hasPhoto: !!input.photoUri });
      let photoUri = input.photoUri;
      let photoStorage: ObservationRecord['photoStorage'];
      if (photoUri) {
        try { photoUri = await persistPhoto(photoUri, id); photoStorage = PHOTO_STORAGE_KIND; }
        catch { photoStorage = 'picker'; }   // report still saved; UI warns the photo may disappear
      }
      const record: ObservationRecord = { id, fieldId: field.id, createdAt: now.toISOString(), observation, symptoms: input.symptoms, certainty: input.certainty, evidence: input.evidence, photoUri, photoStorage, note: input.note?.trim() || undefined, analysis: { kind: 'waiting' }, completedScouting: [] };
      const durable = await commit(s => ({ ...s, records: [record, ...s.records] }));   // local save first
      if (!durable) await patchRecord(record.id, r => ({ ...r, saveFailed: true }));     // keep honest: not on disk yet
      analyse(record, api);                                               // then request analysis
      return record;
    },
    async checkPhoto(input) {
      const field = current.current.fields.find(f => f.id === input.fieldId);
      if (!field) throw new Error('Unknown field');
      const now = new Date();
      const id = newId('obs', now.getTime());
      let photoUri = input.photoUri;
      let photoStorage: ObservationRecord['photoStorage'];
      try { photoUri = await persistPhoto(photoUri, id); photoStorage = PHOTO_STORAGE_KIND; } catch { photoStorage = 'picker'; }
      const locale = current.current.settings.locale;
      const placeholder = { contract_version: '0.1.0', id, data_mode: 'live' as const, observed_at: now.toISOString(), crop: field.crop, locale,
        ...(field.location ? { location: field.location } : {}), signals: [], provenance: { adapter: 'pending', source: 'photo awaiting on-device analysis' } };
      const record: ObservationRecord = { id, fieldId: field.id, createdAt: now.toISOString(), observation: placeholder, symptoms: [], certainty: 'unsure', evidence: [],
        photoUri, photoStorage, analysis: { kind: 'waiting' }, completedScouting: [], pipelineStep: 'saved' };
      const durable = await commit(s => ({ ...s, records: [record, ...s.records.filter(r => r.id !== input.replacesId || r.analysis.kind !== 'follow_up')] }));
      if (!durable) await patchRecord(id, r => ({ ...r, saveFailed: true }));
      void runPhotoPipeline(id, input.analyseAnyway);
      return record;
    },
    sync, syncing, syncNow, localAvailable,
    async retrySave() { return commit(st => ({ ...st })); },
    async retry(recordId) {
      const record = current.current.records.find(r => r.id === recordId);
      if (!record) return;
      if (record.pipelineStep && record.photoUri && (!record.perception || record.analysis.kind === 'follow_up')) return runPhotoPipeline(recordId, record.analysis.kind === 'follow_up');
      await analyse(record, api);
    },
    toggleScouting(recordId, scoutingId) {
      patchRecord(recordId, r => ({ ...r, completedScouting: r.completedScouting.includes(scoutingId) ? r.completedScouting.filter(x => x !== scoutingId) : [...r.completedScouting, scoutingId] }));
    },
    setFollowUp(recordId, days) { patchRecord(recordId, r => ({ ...r, followUpDays: days })); },
    updateSettings(patch) { commit(s => ({ ...s, settings: { ...s.settings, ...patch } })); },
    testConnection,
    async reset() {
      // Only app-owned copies are removed; picked originals/gallery files are never touched.
      for (const r of current.current.records) if (r.photoUri && r.photoStorage === 'app') await deletePhoto(r.photoUri);
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
