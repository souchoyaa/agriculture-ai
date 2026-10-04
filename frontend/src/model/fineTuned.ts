// Team fine-tuned coffee-leaf model (GGUF) served by a local llama.cpp `llama-server`.
// Implements pass 1 of the model's app contract: ≤512 px JPEG, exact prompt, grammar-constrained
// JSON, confidence = renormalised first-token probabilities of the 5 condition labels.
import { FINE_TUNED_VISION as FT } from './config';
import type { PerceptionResult, PhotoSubject } from './probes';

type TopLogprob = { token: string; logprob: number };
type TokenLogprob = { token: string; top_logprobs: TopLogprob[] };
const PREFIX = '"condition": "';

/** Pure: grammar output + per-token top logprobs → PerceptionResult (minus device/ms). */
export function interpretFineTuned(text: string, tokens: TokenLogprob[]): Omit<PerceptionResult, 'device' | 'ms'> {
  const out = JSON.parse(text) as { usable: boolean; reason: string; condition: string };
  const raw = { model: FT.id, model_version: FT.file, strategy: 'labels' as const, labels: [] as { label: string; score: number }[] };
  if (!out.usable) {
    const kind: PhotoSubject = out.reason === 'not_coffee_leaf' ? 'other' : 'plant';
    const scores = { leaf: 0, plant: 0, other: 0, [kind]: 1 } as Record<PhotoSubject, number>;
    return { raw, subject: { kind, scores }, followUp: kind === 'other' ? 'not_a_plant' : 'closer_leaf' };
  }
  let acc = '', probs: Record<string, number> = {};
  for (const t of tokens) {
    if (acc.endsWith(PREFIX)) {
      for (const x of t.top_logprobs) { const label = FT.firstTokens[x.token]; if (label) probs[label] = (probs[label] ?? 0) + Math.exp(x.logprob); }
      break;
    }
    acc += t.token;
  }
  const total = Object.values(probs).reduce((s, v) => s + v, 0);
  // Fallback when top probabilities are unavailable: the chosen label at the contract's threshold (low confidence).
  if (!total) probs = { [FT.firstTokens[Object.keys(FT.firstTokens).find(k => out.condition.startsWith(k)) ?? 'healthy']]: FT.tau };
  else for (const k in probs) probs[k] /= total;
  raw.labels = Object.entries(probs).map(([label, score]) => ({ label, score: Math.round(score * 1000) / 1000 })).sort((a, b) => b.score - a.score);
  return { raw, subject: { kind: 'leaf', scores: { leaf: 1, plant: 0, other: 0 } } };
}

async function toJpeg(image: string | Blob): Promise<string> {
  const blob = image instanceof Blob ? image : await (await fetch(image)).blob();
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, FT.maxSidePx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function fineTunedAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${FT.url}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

export async function perceiveFineTuned(image: string | Blob): Promise<PerceptionResult> {
  const t0 = performance.now();
  const body = {
    messages: [{ role: 'system', content: FT.system },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: await toJpeg(image) } }, { type: 'text', text: FT.user }] }],
    temperature: 0, grammar: FT.grammar, logprobs: true, top_logprobs: 20, max_tokens: 40,
  };
  const r = await fetch(`${FT.url}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`fine-tuned model server: HTTP ${r.status}`);
  const c = (await r.json()).choices[0];
  return { ...interpretFineTuned(c.message.content, c.logprobs?.content ?? []), device: 'llama.cpp (this computer)', ms: Math.round(performance.now() - t0),
    displayName: FT.displayName, fineTuned: true };
}
