import observation from '../../shared/fixtures/observation.json';
import analysis from '../../shared/fixtures/analysis.json';
export type Observation = typeof observation;
export type Analysis = typeof analysis;
export interface Api { analyze(input: Observation): Promise<Analysis> }
export class ApiError extends Error {
  code: string; retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) { super(message); this.code = code; this.retryable = retryable; }
}
export const mockApi: Api = { async analyze(input) {
  const result = JSON.parse(JSON.stringify(analysis)) as Analysis;
  result.observation_id = input.id;
  if (input.crop !== 'coffee') {
    result.status = 'unsupported';
    result.condition = { id: 'unknown', label: 'Unsupported crop', confidence: 0, uncertainty: 'Bootstrap supports coffee demo only' };
    result.scouting = []; result.recommendations = [];
  }
  return result;
}};
export function httpApi(baseUrl: string): Api { return { async analyze(input) {
  let response: Response;
  try { response = await fetch(`${baseUrl}/v1/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000) }); }
  catch { throw new ApiError('network_unavailable', 'Connection unavailable; retain observation locally.', true); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.detail?.code ?? 'http_error', body.detail?.message ?? `HTTP ${response.status}`, body.detail?.retryable ?? response.status >= 500);
  }
  return response.json() as Promise<Analysis>;
}}; }
export { observation as demoObservation };
