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
