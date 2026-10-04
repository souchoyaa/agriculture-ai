// In-browser vision-language model running in a Web Worker (Transformers.js + ONNX Runtime Web).
// The checkpoint is NOT hard-coded: the app sends its model config (src/model/config.ts) with 'load'.
//
// In:  {type:'load', config:{id, revision, dtype:{webgpu, wasm}}}
//      {type:'probe', id, image, questions:[{id, text}], system}   → yes-probability per question
//      {type:'run',   id, image, messages, maxNewTokens}           → free text (diagnostics only)
// Out: {type:'progress', ...} | {type:'ready', device, model} | {type:'probe-result', id, answers:[{id, p_yes}], ms}
//      | {type:'result', id, text, ms} | {type:'error', id?, message}
import { AutoModelForImageTextToText, AutoProcessor, LogitsProcessor, LogitsProcessorList, RawImage, env } from '@huggingface/transformers';

env.allowLocalModels = false;                   // weights come from the Hugging Face Hub, cached by the browser (Cache API)
env.backends.onnx.wasm.wasmPaths = '/vlm/ort/'; // ONNX Runtime wasm served by this app, not a CDN
let model, processor, device, yesIds, noIds;

async function load(cfg) {
  if (model) return;
  device = (self.navigator && 'gpu' in self.navigator && await self.navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  const progress_callback = p => self.postMessage({ type: 'progress', ...p });
  const opts = { revision: cfg.revision, progress_callback };
  processor = await AutoProcessor.from_pretrained(cfg.id, opts);
  model = await AutoModelForImageTextToText.from_pretrained(cfg.id, { ...opts, device, dtype: cfg.dtype[device] });
  const ids = words => [...new Set(words.map(w => processor.tokenizer.encode(w, { add_special_tokens: false })[0]))];
  yesIds = ids(['Yes', 'yes', ' Yes', ' yes', 'YES']);
  noIds = ids(['No', 'no', ' No', ' no', 'NO']);
  self.postMessage({ type: 'ready', device, model: cfg.id });
}

const toImage = image => image instanceof Blob ? RawImage.fromBlob(image) : RawImage.fromURL(image);

/** Captures the logits of the first generated token. */
class CaptureFirst extends LogitsProcessor {
  constructor() { super(); this.logits = null; }
  _call(input_ids, logits) { if (!this.logits) this.logits = Array.from(logits[0]?.data ?? logits.data); return logits; }
}

const logSumExp = xs => { const m = Math.max(...xs); return m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0)); };

async function probe({ id, image, questions, system }) {
  const t0 = performance.now();
  const img = await toImage(image);
  const answers = [];
  for (const q of questions) {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: [{ type: 'image' }, { type: 'text', text: q.text }] },
    ];
    const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
    const inputs = await processor(img, text);
    const capture = new CaptureFirst();
    const list = new LogitsProcessorList(); list.push(capture);
    await model.generate({ ...inputs, max_new_tokens: 1, do_sample: false, logits_processor: list });
    const l = capture.logits;
    if (q.options) {
      // Multiple choice: softmax over the option letters (A, B, …) only.
      const ids = q.options.map(o => processor.tokenizer.encode(o.key, { add_special_tokens: false })[0]);
      const z = logSumExp(ids.map(i => l[i]));
      answers.push({ id: q.id, choice: Object.fromEntries(q.options.map((o, k) => [o.id, Math.exp(l[ids[k]] - z)])) });
    } else {
      // P(yes) normalised over the yes/no answer tokens only (uncalibrated model belief, not a disease probability).
      const ly = logSumExp(yesIds.map(i => l[i])), ln = logSumExp(noIds.map(i => l[i]));
      answers.push({ id: q.id, p_yes: 1 / (1 + Math.exp(ln - ly)) });
    }
  }
  self.postMessage({ type: 'probe-result', id, answers, ms: Math.round(performance.now() - t0) });
}

async function run({ id, image, messages, maxNewTokens = 256 }) {
  const t0 = performance.now();
  const img = await toImage(image);
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(img, text);
  const out = await model.generate({ ...inputs, do_sample: false, max_new_tokens: maxNewTokens, repetition_penalty: 1.05 });
  const generated = out.slice(null, [inputs.input_ids.dims.at(-1), null]);
  self.postMessage({ type: 'result', id, text: processor.batch_decode(generated, { skip_special_tokens: true })[0].trim(), ms: Math.round(performance.now() - t0) });
}

self.onmessage = async e => {
  try {
    if (e.data.type === 'load') return await load(e.data.config);
    if (!model) throw new Error('model not loaded');
    if (e.data.type === 'probe') await probe(e.data);
    else if (e.data.type === 'run') await run(e.data);
  } catch (err) {
    self.postMessage({ type: 'error', id: e.data.id, message: String(err && err.message || err) });
  }
};
