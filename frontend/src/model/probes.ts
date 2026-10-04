// Pure perception logic (no React Native / workers): probe definitions and their interpretation.
import { VISION_MODEL } from './config';

export interface RawVisionOutput {
  model: string; model_version: string; strategy: 'probe' | 'labels';
  labels: { label: string; score: number }[];        // dataset-style labels (backend data/vlm_label_map.json)
}
export type PhotoSubject = 'leaf' | 'plant' | 'other';
export interface PerceptionResult {
  raw: RawVisionOutput;
  subject: { kind: PhotoSubject; scores: Record<PhotoSubject, number> };
  /** One short request for better evidence, only when needed. */
  followUp?: 'not_a_plant' | 'closer_leaf';
  device: string; ms: number;
  /** Set when a model other than VISION_MODEL produced this result (e.g. the fine-tuned server). */
  displayName?: string; fineTuned?: boolean;
}

export const SYSTEM = 'You are a careful agricultural image inspector. Answer with the letter of the best option only.';
type Opt = [id: string, text: string];
function choice(id: string, text: string, opts: Opt[]) {
  return { id, text: `${text}\n${opts.map((o, k) => `${'ABCDEFG'[k]}) ${o[1]}`).join('\n')}\nAnswer:`, options: opts.map((o, k) => ({ id: o[0], key: 'ABCDEFG'[k] })) };
}
const SUBJECT: Opt[] = [['leaf', 'a close-up of a plant leaf'], ['plant', 'a whole plant or branch'], ['other', 'something that is not a plant']];
// Labels use the dataset vocabulary mapped by the backend (rust, cercospora, leaf_miner, healthy).
const CONDITION: Opt[] = [['rust', 'orange or yellow-orange powdery spots'], ['cercospora', 'round brown spots with a pale grey centre and a yellow halo'],
  ['leaf_miner', 'pale brown dry blotches or tunnels from insect larvae'], ['healthy', 'green and healthy with no spots'], ['other', 'some other damage']];
/** Each multiple-choice question is asked in forward and reversed option order and averaged (position-bias control). */
export const PROBES = [
  choice('subject', 'What does this photo mainly show?', SUBJECT), choice('subject~r', 'What does this photo mainly show?', [...SUBJECT].reverse()),
  choice('condition', 'Which description best matches the leaf?', CONDITION), choice('condition~r', 'Which description best matches the leaf?', [...CONDITION].reverse()),
  { id: 'rust_yn', text: 'Are there orange or yellow-orange powdery spots on the leaf? Answer Yes or No.' },
];

export type Answer = { id: string; choice?: Record<string, number>; p_yes?: number };

/** Pure: combine probe answers into the label list + photo subject (unit-tested). */
export function interpretProbes(answers: Answer[], model = VISION_MODEL): Omit<PerceptionResult, 'device' | 'ms'> {
  const avg = (base: string) => {
    const out: Record<string, number> = {};
    const parts = answers.filter(a => a.id === base || a.id === `${base}~r`);
    for (const a of parts) for (const [k, v] of Object.entries(a.choice ?? {})) out[k] = (out[k] ?? 0) + v / parts.length;
    return out;
  };
  const subj = avg('subject') as Record<PhotoSubject, number>;
  const kind = (Object.entries(subj).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other') as PhotoSubject;
  const cond = avg('condition');
  const rustYes = answers.find(a => a.id === 'rust_yn')?.p_yes;
  const labels = Object.entries(cond).filter(([k]) => k !== 'other').map(([label, score]) => ({ label, score }));
  // Rust: the yes/no probe separates best on the stock checkpoint; keep the stronger of the two estimates.
  const rust = labels.find(l => l.label === 'rust');
  if (rust && rustYes != null) rust.score = Math.max(rust.score, rustYes);
  for (const l of labels) l.score = Math.round(l.score * 1000) / 1000;
  return {
    raw: { model: model.id, model_version: model.revision, strategy: model.strategy, labels: labels.sort((a, b) => b.score - a.score) },
    subject: { kind, scores: subj },
    followUp: kind === 'other' ? 'not_a_plant' : kind === 'plant' ? 'closer_leaf' : undefined,
  };
}

