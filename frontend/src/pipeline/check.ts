// Automatic field-check orchestration. The farmer only takes a photo; every downstream step runs
// without them choosing tools: perception → canonical observation (backend adapter) → history →
// on-device analysis (weather, risk, scouting, sourced guidance) → translation.
// Deterministic code orchestrates a few read-only tools; nothing here has side effects beyond the
// callbacks. Dependencies are injected so the chain is testable without a browser.
import type { Analysis, Observation } from '../api';
import type { Field, ObservationRecord } from '../domain/model';
import { conditionPresent } from '../domain/model';
import type { PerceptionResult, RawVisionOutput } from '../model/perception';

export type CheckStep = 'looking' | 'context' | 'translating' | 'done';
export interface PriorObservation { id?: string; observed_at?: string; condition_id: string; present: boolean; latitude: number; longitude: number; location_basis?: string }

export interface CheckDeps {
  perceive(image: string | Blob): Promise<PerceptionResult>;
  observe(raw: RawVisionOutput, context: { id: string; observed_at: string; crop: string; locale?: string; location?: { latitude: number; longitude: number }; data_mode?: string }): Promise<Observation>;
  analyze(observation: Observation): Promise<Analysis>;
  translate(analysis: Analysis, locale: string): Promise<Analysis>;
  needsTranslation(locale: string): boolean;
}

export interface CheckInput { id: string; observedAt: string; field: Field; image: string | Blob; locale: string; history: ObservationRecord[]; analyseAnyway?: boolean }
export type CheckOutcome =
  | { kind: 'follow_up'; perception: PerceptionResult; followUp: NonNullable<PerceptionResult['followUp']> }
  | { kind: 'analysed'; perception: PerceptionResult; observation: Observation; analysis: Analysis };

/** Device history → backend prior observations (same field location basis; never re-entered by the farmer). */
export function priorsFromHistory(history: ObservationRecord[], fieldId: string, excludeId: string): PriorObservation[] {
  return history
    .filter(r => r.fieldId === fieldId && r.id !== excludeId && r.analysis.kind === 'done' && r.observation.location)
    .map(r => {
      const a = (r.analysis as Extract<ObservationRecord['analysis'], { kind: 'done' }>).analysis;
      const condition_id = (a.condition.candidate_id as string | undefined) ?? a.condition.id;
      return { id: r.id, observed_at: r.observation.observed_at, condition_id, present: conditionPresent(a),
        latitude: r.observation.location!.latitude, longitude: r.observation.location!.longitude, location_basis: 'field' };
    })
    .filter(p => !['unknown', 'undetermined'].includes(p.condition_id))
    .slice(0, 20);
}

export async function runAutomaticCheck(input: CheckInput, deps: CheckDeps, onStep: (s: CheckStep) => void = () => {}): Promise<CheckOutcome> {
  onStep('looking');
  const perception = await deps.perceive(input.image);
  if (perception.followUp === 'not_a_plant' || (perception.followUp === 'closer_leaf' && !input.analyseAnyway))
    return { kind: 'follow_up', perception, followUp: perception.followUp };

  const machine = deps.needsTranslation(input.locale);
  const observation = await deps.observe(perception.raw, {
    id: input.id, observed_at: input.observedAt, crop: input.field.crop,
    locale: machine ? 'en' : input.locale,             // engine localises en/fr/es; other languages are translated after
    ...(input.field.location ? { location: input.field.location } : {}),
    data_mode: 'live',
  });
  const locationNote = input.field.demo && input.field.location ? '; example field location, not verified as your farm'
    : input.field.location && input.field.locationSource ? `; field location from ${input.field.locationSource === 'gps' ? 'device GPS' : 'manual entry'}` : '';
  observation.provenance = { ...observation.provenance, source: `${observation.provenance.source}; on-device inference (${perception.device})${locationNote}` };
  const priors = priorsFromHistory(input.history, input.field.id, input.id);
  if (priors.length) (observation as any).prior_observations = priors;

  onStep('context');
  let analysis = await deps.analyze(observation);
  if (machine) { onStep('translating'); analysis = await deps.translate(analysis, input.locale); }
  onStep('done');
  return { kind: 'analysed', perception, observation, analysis };
}
