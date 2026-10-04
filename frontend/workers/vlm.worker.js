// In-browser vision-language model (LiquidAI LFM2.5-VL-450M, ONNX) running in a Web Worker.
// Messages in:  {type:'load'} | {type:'run', id, image: Blob|string(url), messages:[{role, content}], maxNewTokens}
// Messages out: {type:'progress', file, loaded, total, status} | {type:'ready', device} | {type:'result', id, text, ms} | {type:'error', id?, message}
import { AutoModelForImageTextToText, AutoProcessor, RawImage, env } from '@huggingface/transformers';

const MODEL_ID = 'LiquidAI/LFM2.5-VL-450M-ONNX';
env.allowLocalModels = false;          // weights come from the Hugging Face Hub, cached by the browser (Cache API)
env.backends.onnx.wasm.wasmPaths = '/vlm/ort/'; // ONNX Runtime wasm served by this app, not a CDN
let model, processor, device;

async function load() {
  if (model) return;
  device = (self.navigator && 'gpu' in self.navigator && await self.navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  const progress_callback = p => self.postMessage({ type: 'progress', ...p });
  const dtype = device === 'webgpu'
    ? { vision_encoder: 'fp16', embed_tokens: 'fp16', decoder_model_merged: 'q4' }
    : { vision_encoder: 'q8', embed_tokens: 'fp32', decoder_model_merged: 'q4' };
  processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
  model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, { device, dtype, progress_callback });
  self.postMessage({ type: 'ready', device });
}

async function run({ id, image, messages, maxNewTokens = 256 }) {
  await load();
  const t0 = performance.now();
  const img = image instanceof Blob ? await RawImage.fromBlob(image) : await RawImage.fromURL(image);
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(img, text);
  const out = await model.generate({ ...inputs, do_sample: false, max_new_tokens: maxNewTokens, repetition_penalty: 1.05 });
  const generated = out.slice(null, [inputs.input_ids.dims.at(-1), null]);
  const decoded = processor.batch_decode(generated, { skip_special_tokens: true })[0];
  self.postMessage({ type: 'result', id, text: decoded.trim(), ms: Math.round(performance.now() - t0) });
}

self.onmessage = async e => {
  try {
    if (e.data.type === 'load') await load();
    else if (e.data.type === 'run') await run(e.data);
  } catch (err) {
    self.postMessage({ type: 'error', id: e.data.id, message: String(err && err.message || err) });
  }
};
