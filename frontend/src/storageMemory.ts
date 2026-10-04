import type { KeyValueStore } from './storage';

/** In-memory store for tests and for when device storage is unavailable. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    async getItem(key) { return key in data ? data[key] : null; },
    async setItem(key, value) { data[key] = value; },
    async removeItem(key) { delete data[key]; },
  };
}
