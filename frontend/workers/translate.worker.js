// In-browser translation for languages the vision model does not cover (e.g. Kinyarwanda, Swahili).
// Model: NLLB-200 distilled 600M (Meta, CC BY-NC 4.0) via Transformers.js. Output is machine translation.
// In:  {type:'load'} | {type:'translate', id, text, src, tgt}   (NLLB codes, e.g. eng_Latn → kin_Latn)
// Out: {type:'progress',...} | {type:'ready', device} | {type:'result', id, text, ms} | {type:'error', id?, message}
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = '/vlm/ort/';
const MODEL_ID = 'Xenova/nllb-200-distilled-600M';
let translator, device;

async function load() {
  if (translator) return;
  device = 'wasm'; // q8 seq2seq is reliable on wasm; WebGPU is kept for the vision model
  translator = await pipeline('translation', MODEL_ID, { device, dtype: 'q8', progress_callback: p => self.postMessage({ type: 'progress', ...p }) });
  self.postMessage({ type: 'ready', device });
}

self.onmessage = async e => {
  const { type, id, text, src, tgt } = e.data;
  try {
    if (type === 'load') return await load();
    if (type !== 'translate') return;
    await load();
    const t0 = performance.now();
    // Translate sentence by sentence: NLLB is trained on sentence pairs.
    const parts = String(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    const out = [];
    for (const p of parts) out.push((await translator(p, { src_lang: src, tgt_lang: tgt, max_new_tokens: 256 }))[0].translation_text);
    self.postMessage({ type: 'result', id, text: out.join(' '), ms: Math.round(performance.now() - t0) });
  } catch (err) { self.postMessage({ type: 'error', id, message: String(err && err.message || err) }); }
};
