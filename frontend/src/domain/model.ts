// Pure domain state for the field companion. No React, storage or network here.
import type { Analysis, Observation, Signal } from '../api';

export interface Field {
  id: string; name: string; crop: string;
  location?: { latitude: number; longitude: number };
  demo: boolean; // seeded example data; always labelled in UI
}

export type AnalysisState =
  | { kind: 'not_requested' }
  | { kind: 'waiting' }                                   // queued locally, waiting for connection/retry
  | { kind: 'done'; analysis: Analysis; via: 'mock' | 'http' }
  | { kind: 'failed'; code: string; message: string; retryable: boolean; at: string };

export interface ObservationRecord {
  id: string; fieldId: string; createdAt: string;
  observation: Observation;
  symptoms: string[];            // stable symptom ids selected by the farmer
  certainty: 'sure' | 'unsure';
  evidence: string[];            // stable evidence-checklist ids the farmer confirmed
  photoUri?: string;             // device-local only; never uploaded by this app
  note?: string;
  analysis: AnalysisState;
  followUpDays?: number;         // local reminder intent; no push notification
  completedScouting: string[];   // scouting ids the farmer ticked off
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
      source: args.hasPhoto ? 'symptom checklist; photo kept on device, not analysed' : 'symptom checklist; no photo',
    },
  };
}

export type Attention = 'act' | 'check' | 'ok' | 'unknown';

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
  if (a.analysis.status === 'needs_review') return { level: 'act', latest, reason: 'needs_review' };
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
