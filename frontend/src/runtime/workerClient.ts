// Promise-based request/response over a module Web Worker (web only). Native platforms report unavailable.
import { Platform } from 'react-native';

export type Progress = { file?: string; loaded?: number; total?: number; status?: string };
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class WorkerClient {
  private worker?: Worker;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private readyPromise?: Promise<any>;
  private progressListeners = new Set<(p: Progress) => void>();
  constructor(private url: string, private resultTypes: string[]) {}

  static supported(): boolean {
    return Platform.OS === 'web' && typeof Worker !== 'undefined';
  }

  onProgress(fn: (p: Progress) => void): () => void { this.progressListeners.add(fn); return () => this.progressListeners.delete(fn); }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    if (!WorkerClient.supported()) throw new Error('worker_unsupported');
    const w = new Worker(this.url, { type: 'module' });
    w.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'progress') { this.progressListeners.forEach(fn => fn(d)); return; }
      if (d.type === 'ready') { this.pending.get('__ready')?.resolve(d); this.pending.delete('__ready'); return; }
      const p = d.id != null ? this.pending.get(String(d.id)) : undefined;
      if (d.type === 'error') {
        const err = new Error(d.message);
        if (p) { p.reject(err); this.pending.delete(String(d.id)); }
        else { this.pending.get('__ready')?.reject(err); this.pending.delete('__ready'); this.readyPromise = undefined; }
        return;
      }
      if (p && this.resultTypes.includes(d.type)) { p.resolve(d); this.pending.delete(String(d.id)); }
    };
    w.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message || 'worker failed to start');
      this.pending.forEach(p => p.reject(err)); this.pending.clear(); this.readyPromise = undefined; this.worker = undefined;
    };
    this.worker = w;
    return w;
  }

  ready(loadMessage: Record<string, unknown>): Promise<any> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve, reject) => {
        this.pending.set('__ready', { resolve, reject });
        this.ensure().postMessage({ type: 'load', ...loadMessage });
      });
    }
    return this.readyPromise;
  }

  request<T = any>(message: Record<string, unknown>, timeoutMs = 120000): Promise<T> {
    const id = `r${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout')); }, timeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.ensure().postMessage({ ...message, id });
    });
  }
}
