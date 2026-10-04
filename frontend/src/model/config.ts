// THE single place that names model checkpoints. Swapping the public checkpoint for the team's
// fine-tuned one means editing this file (id/revision, and `strategy: 'labels'` if the fine-tuned
// model emits dataset labels directly). Nothing downstream changes.

export interface VisionModelConfig {
  id: string;                 // Hugging Face repo (ONNX export for Transformers.js)
  revision: string;           // pin a commit hash for reproducible demos
  displayName: string;
  fineTuned: boolean;
  /** 'probe': stock model asked structured questions → label list. 'labels': model emits label list directly. */
  strategy: 'probe' | 'labels';
  dtype: { webgpu: Record<string, string>; wasm: Record<string, string> };
  approxDownloadMB: number;
}

export interface TranslationModelConfig {
  id: string; revision: string; displayName: string; license: string; dtype: string; approxDownloadMB: number;
  /** App locale → model language code. Only languages the analysis engine cannot localise itself. */
  languages: Record<string, string>;
  sourceLanguage: string;
}

export const VISION_MODEL: VisionModelConfig = {
  id: 'LiquidAI/LFM2.5-VL-450M-ONNX',
  revision: 'main',
  displayName: 'Liquid LFM2.5-VL 450M (public checkpoint, not fine-tuned)',
  fineTuned: false,
  strategy: 'probe',
  dtype: {
    webgpu: { vision_encoder: 'fp16', embed_tokens: 'fp16', decoder_model_merged: 'q4' },
    wasm: { vision_encoder: 'q8', embed_tokens: 'fp32', decoder_model_merged: 'q4' },
  },
  approxDownloadMB: 772,
};

/** Team fine-tune (GGUF, llama.cpp only — Transformers.js cannot load it). Served by a local
 * `llama-server` (see docs/models/fine-tuned-coffee-leaf.md); when unreachable the app falls back to VISION_MODEL. */
export const FINE_TUNED_VISION = {
  id: 'nathanrchn/coffee-leaf-lfm2.5-vl-450m-GGUF',
  file: 'coffee-lfm-tools-Q5_K_M.gguf',
  displayName: 'Coffee-leaf LFM2.5-VL 450M (team fine-tune, GGUF Q5_K_M via llama.cpp)',
  url: 'http://127.0.0.1:8090',
  // Exact pass-1 contract (app_contract.md §2–3).
  system: 'You check photos of coffee leaves for a farmer. Reply with exactly one JSON object and nothing else.',
  user: 'Check this leaf.',
  grammar: [
    'root   ::= "{\\"usable\\": " ( yes | no ) "}"',
    'yes    ::= "true, \\"reason\\": \\"ok\\", \\"condition\\": \\"" cond "\\""',
    'no     ::= "false, \\"reason\\": \\"" reason "\\", \\"condition\\": \\"none\\""',
    'cond   ::= "healthy" | "rust" | "cercospora" | "phoma" | "miner"',
    'reason ::= "blurry" | "too_dark" | "too_far" | "not_coffee_leaf"',
  ].join('\n'),
  /** First token of each condition label → app label (dataset vocabulary of backend data/vlm_label_map.json). */
  firstTokens: { healthy: 'healthy', rust: 'rust', cer: 'cercospora', ph: 'phoma', min: 'leaf_miner' } as Record<string, string>,
  tau: 0.3537,       // tau(0.90) from validation: below → low confidence
  maxSidePx: 512,
};

export const TRANSLATION_MODEL: TranslationModelConfig = {
  id: 'Xenova/nllb-200-distilled-600M',
  revision: 'main',
  displayName: 'Meta NLLB-200 distilled 600M (machine translation)',
  license: 'CC BY-NC 4.0 (non-commercial)',
  dtype: 'q8',
  approxDownloadMB: 900,
  languages: { rw: 'kin_Latn', sw: 'swh_Latn' },
  sourceLanguage: 'eng_Latn',
};
