// Generation-guarded connection checks. A health response that arrives after the source or
// address changed is discarded, and only the adapter that passed the latest check is "verified".
import type { Api, Health } from '../api';

export type Connection =
  | { kind: 'local' }
  | { kind: 'checking' }
  | { kind: 'unverified' }   // server selected/changed but not probed yet (no automatic probe)
  | { kind: 'ok'; health: Health }
  | { kind: 'unreachable'; message: string };

export class ConnectionGate {
  private generation = 0;
  private verified?: Api;
  private target?: Api;

  /** Call whenever the active adapter changes; in-flight checks become stale. */
  invalidate(): void { this.generation++; this.verified = undefined; }

  /** Resolves to the new connection, or null when superseded by a newer check/adapter. */
  async check(api: Api): Promise<Connection | null> {
    this.invalidate();
    this.target = api;
    const mine = this.generation;
    if (api.kind === 'mock') return { kind: 'local' };
    try {
      const health = await api.health();
      if (mine !== this.generation) return null;
      this.verified = api;
      return { kind: 'ok', health };
    } catch (e) {
      if (mine !== this.generation) return null;
      return { kind: 'unreachable', message: String((e as Error)?.message ?? e) };
    }
  }

  /**
   * Called when the active adapter changes. Returns false (and invalidates) unless this exact
   * adapter is the one being checked or already verified, so a Test-button check survives.
   */
  adopt(api: Api): boolean {
    if (this.target === api) return true;
    this.invalidate(); this.target = undefined;
    return false;
  }

  /** True only for the exact HTTP adapter instance that passed the latest health check. */
  isVerified(api: Api): boolean { return api.kind === 'http' && this.verified === api; }
}
