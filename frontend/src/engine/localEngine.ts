// On-device analysis engine: the Python backend running in the browser (Pyodide worker).
// Implements the same Api interface as the HTTP adapter, so views do not change.
import type { Analysis, Api, Health, Observation } from '../api';
import { WorkerClient } from '../runtime/workerClient';
import type { RawVisionOutput } from '../model/perception';

const client = new WorkerClient('/engine/engine.worker.js', ['result']);
export const engineAvailable = () => WorkerClient.supported();
export const loadEngine = () => client.ready({});

export interface EngineContext { id: string; observed_at: string; crop: string; locale?: string; location?: { latitude: number; longitude: number; accuracy_m?: number; basis?: string }; data_mode?: string }

/** Model output → canonical observation through the backend's own adapter boundary. */
export async function observe(raw: RawVisionOutput, context: EngineContext): Promise<Observation> {
  await loadEngine();
  return (await client.request<{ value: Observation }>({ type: 'observe', raw, context })).value;
}

export function localEngineApi(getWeather: () => Promise<unknown[]>, fixedNow?: string): Api {
  return {
    kind: 'local',
    async analyze(observation: Observation): Promise<Analysis> {
      await loadEngine();
      const weather = await getWeather();
      return (await client.request<{ value: Analysis }>({ type: 'analyze', observation, weather, now: fixedNow }, 60000)).value;
    },
    async health(): Promise<Health> {
      await loadEngine();
      return { status: 'ok', contract_version: '0.1.0', data_mode: 'cached', capabilities: { image_inference: 'on-device', weather: 'last synced cache', calibration: 'none: uncalibrated heuristics', persistence: 'this device' } } as Health;
    },
  };
}
