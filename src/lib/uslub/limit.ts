/**
 * In-memory limiters (per server instance) that protect AI spend.
 * Used by the API routes (keyed by IP) and the bot (keyed by Telegram user id).
 * Pure: no I/O, time is injectable for tests.
 */

export type TakeResult = { ok: true } | { ok: false; retryAfterMs: number };

/** Sliding-window limiter: at most `limit` hits per `windowMs` per key. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Records a hit if allowed; otherwise says how long to wait. */
  take(key: string, now = Date.now()): TakeResult {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: Math.max(1000, this.windowMs - (now - recent[0])) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(now);
    return { ok: true };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
}

export type GateResult = { ok: true } | { ok: false; reason: "busy" } | { ok: false; reason: "limit"; retryAfterMs: number };

/**
 * Bot onboarding gate per Telegram user: one onboarding in flight and at most
 * `perHour` started per hour. Call `leave` when the job finishes (also on error).
 */
export function createOnboardGate(perHour = 5) {
  const limiter = new RateLimiter(perHour, 3600_000);
  const inFlight = new InFlight();
  return {
    enter(userId: number, now = Date.now()): GateResult {
      const key = String(userId);
      if (!inFlight.tryStart(key)) return { ok: false, reason: "busy" };
      const r = limiter.take(key, now);
      if (!r.ok) {
        inFlight.end(key);
        return { ok: false, reason: "limit", retryAfterMs: r.retryAfterMs };
      }
      return { ok: true };
    },
    leave(userId: number): void {
      inFlight.end(String(userId));
    },
  };
}

/** At most one running job per key. */
export class InFlight {
  private running = new Set<string>();

  tryStart(key: string): boolean {
    if (this.running.has(key)) return false;
    this.running.add(key);
    return true;
  }

  end(key: string): void {
    this.running.delete(key);
  }
}
