// Pure domain state for the field companion. No React, storage or network here.
import type { Analysis, Observation, Signal } from '../api';

export interface Field {
  id: string; name: string; crop: string;
  location?: { latitude: number; longitude: number };
  demo: boolean; // seeded example data; always labelled in UI
  /** How a user-added field got its location; absent for example fields. */
  locationSource?: 'gps' | 'manual';
}

export type AnalysisState =
  | { kind: 'not_requested' }
  | { kind: 'waiting' }                                   // queued locally, waiting for connection/retry
  | { kind: 'done'; analysis: Analysis; via: 'mock' | 'http' | 'local' }
  | { kind: 'failed'; code: string; message: string; retryable: boolean; at: string }
  /** The model asked for better evidence (one short follow-up) instead of guessing. */
  | { kind: 'follow_up'; reason: 'not_a_plant' | 'closer_leaf'; at: string };

/** What the on-device vision model reported for this photo (kept for transparency and history). */
export interface PerceptionSummary {
  model: string; displayName: string; fineTuned: boolean; device: string; ms: number;
  labels: { label: string; score: number }[];
  subject: { kind: 'leaf' | 'plant' | 'other'; scores: Record<string, number> };
}

export interface ObservationRecord {
  id: string; fieldId: string; createdAt: string;
  observation: Observation;
  symptoms: string[];            // stable symptom ids selected by the farmer
  certainty: 'sure' | 'unsure';
  evidence: string[];            // stable evidence-checklist ids the farmer confirmed
  photoUri?: string;             // device-local only; never uploaded by this app
  /** 'app' = copied into app storage; 'web' = stored in record; 'picker' = copy failed, original/cache URI kept (may vanish). */
  photoStorage?: 'app' | 'web' | 'picker';
  note?: string;
  analysis: AnalysisState;
  followUpDays?: number;         // local reminder intent; no push notification
  completedScouting: string[];   // scouting ids the farmer ticked off
  /** Set when the durable local write failed; the record exists only in memory until a retry succeeds. */
  saveFailed?: boolean;
  /** Photo-first checks: model findings and the current automatic step. Absent on legacy symptom-report records. */
  perception?: PerceptionSummary;
  pipelineStep?: 'saved' | 'looking' | 'context' | 'translating' | 'done';
  translation?: { target: string; model: string; machine: true; segments: number; ms: number };
}

/** Symptom ids map 1:1 to canonical signal labels (backend coffee signal vocabulary; insect_damage is passed through as unrecognised). */
export const SYMPTOMS = [
  { id: 'orange_powder_leaf_underside', glyph: '◍' },
  { id: 'yellow_spots_upper_leaf', glyph: '◐' },
  { id: 'brown_dry_lesion_centres', glyph: '◉' },
  { id: 'lesions_lower_canopy_first', glyph: '⤓' },
  { id: 'premature_leaf_drop', glyph: '↓' },
  { id: 'insect_damage', glyph: '✱' },
  { id: 'none_visible', glyph: '○' },
] as const;
export type SymptomId = typeof SYMPTOMS[number]['id'];

export const EVIDENCE_CHECKS = ['daylight', 'underside', 'close_up', 'several_plants'] as const;

/**
 * Farmer self-report becomes canonical signals. Confidence encodes the farmer's stated
 * certainty (not image analysis); origin is recorded as an additive field.
 */
export function symptomsToSignals(symptoms: string[], certainty: 'sure' | 'unsure'): Signal[] {
  const confidence = certainty === 'sure' ? 0.8 : 0.5;
  return symptoms.filter(s => s !== 'none_visible').map(label => ({ label, confidence, origin: 'farmer_report' }));
}

let counter = 0;
export function newId(prefix: string, now = Date.now()): string {
  counter = (counter + 1) % 1000;
  return `${prefix}-${now.toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function buildObservation(args: {
  id: string; field: Field; symptoms: string[]; certainty: 'sure' | 'unsure'; locale: string; now: Date; hasPhoto: boolean;
}): Observation {
  return {
    contract_version: '0.1.0',
    id: args.id,
    data_mode: 'live',
    observed_at: args.now.toISOString(),
    crop: args.field.crop,
    locale: args.locale,
    ...(args.field.location ? { location: args.field.location } : {}),
    signals: symptomsToSignals(args.symptoms, args.certainty),
    provenance: {
      adapter: 'farmer-report',
      source: (args.hasPhoto ? 'symptom checklist; photo kept on device, not analysed' : 'symptom checklist; no photo')
        + (args.field.demo && args.field.location ? '; example field location, not verified as your farm' : '')
        + (!args.field.demo && args.field.location && args.field.locationSource ? `; field location from ${args.field.locationSource === 'gps' ? 'device GPS' : 'manual entry'}, rounded to about 100 m` : ''),
    },
  };
}

export type Attention = 'act' | 'check' | 'ok' | 'unknown';

const NO_CONDITION_IDS = new Set(['healthy', 'undetermined', 'unknown', 'none']);
/** True when the analysis names an actual condition (not abstained, healthy or unknown). */
export function conditionPresent(a: Analysis): boolean {
  return !a.condition.abstained && !NO_CONDITION_IDS.has(a.condition.id);
}

/**
 * Attention is a presentation summary of the latest backend status plus record age.
 * It is not a risk model: it never upgrades/downgrades scientific conclusions.
 */
export function fieldAttention(records: ObservationRecord[], now: Date, staleDays = 14): { level: Attention; latest?: ObservationRecord; reason: string } {
  const latest = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return { level: 'unknown', reason: 'never_checked' };
  const ageDays = (now.getTime() - Date.parse(latest.createdAt)) / 86400000;
  const a = latest.analysis;
  if (a.kind === 'waiting' || a.kind === 'failed') return { level: 'check', latest, reason: 'analysis_pending' };
  if (a.kind === 'not_requested') return { level: 'check', latest, reason: 'analysis_pending' };
  if (a.kind === 'follow_up') return { level: 'check', latest, reason: 'photo_needed' };
  if (a.analysis.status === 'needs_review') return { level: 'act', latest, reason: 'needs_review' };
  // A supported finding of a named condition is a reason to act, never "no issue".
  if (a.analysis.status === 'supported' && conditionPresent(a.analysis)) return { level: 'act', latest, reason: 'condition_supported' };
  if (latest.followUpDays !== undefined && ageDays >= latest.followUpDays) return { level: 'check', latest, reason: 'follow_up_due' };
  if (ageDays > staleDays) return { level: 'check', latest, reason: 'check_overdue' };
  if (a.analysis.status === 'unsupported' || a.analysis.status === 'unavailable') return { level: 'check', latest, reason: a.analysis.status };
  return { level: 'ok', latest, reason: 'recent_check' };
}

const ORDER: Record<Attention, number> = { act: 0, check: 1, unknown: 2, ok: 3 };
export function sortFieldsByAttention<T extends { level: Attention }>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** Describes the confidence score in words without implying calibrated probability. */
export function signalStrength(confidence: number): 'weak' | 'moderate' | 'strong' {
  return confidence < 0.4 ? 'weak' : confidence < 0.75 ? 'moderate' : 'strong';
}

export function followUpDue(record: ObservationRecord, now: Date): Date | undefined {
  if (record.followUpDays === undefined) return undefined;
  return new Date(Date.parse(record.createdAt) + record.followUpDays * 86400000);
}

export function ageLabelDays(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 86400000));
}
