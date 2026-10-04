// Photo → model output in the label-list format the backend's LabelListVLMAdapter consumes.
// Model-specific prompting lives here and in the worker only; nothing downstream depends on it.
import { VISION_MODEL } from './config';
import { WorkerClient, type Progress } from '../runtime/workerClient';
import { fineTunedAvailable, perceiveFineTuned } from './fineTuned';

export * from './probes';
import { interpretProbes, PROBES, SYSTEM, type Answer, type PerceptionResult } from './probes';

const client = new WorkerClient('/vlm/vlm.worker.js', ['probe-result', 'result']);
export const visionAvailable = () => WorkerClient.supported();
export const onVisionProgress = (fn: (p: Progress) => void) => client.onProgress(fn);
export async function loadVision(): Promise<{ device: string }> {
  const r = await client.ready({ config: VISION_MODEL });
  try { localStorage.setItem('field-companion/vision-cached', VISION_MODEL.id + '@' + VISION_MODEL.revision); } catch { /* storage optional */ }
  return { device: r.device };
}
export function visionCached(): boolean {
  try { return localStorage.getItem('field-companion/vision-cached') === VISION_MODEL.id + '@' + VISION_MODEL.revision; } catch { return false; }
}

export async function perceive(image: string | Blob): Promise<PerceptionResult> {
  // Team fine-tune first when its local llama.cpp server is up; otherwise the in-browser public checkpoint.
  if (await fineTunedAvailable()) return perceiveFineTuned(image);
  const { device } = await loadVision();
  if (VISION_MODEL.strategy === 'labels') throw new Error('labels strategy: implement the fine-tuned output parser here');
  const r = await client.request<{ answers: Answer[]; ms: number }>({ type: 'probe', image, questions: PROBES, system: SYSTEM }, 180000);
  return { ...interpretProbes(r.answers), device, ms: r.ms };
}
