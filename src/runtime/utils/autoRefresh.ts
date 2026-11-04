// Timing rules of useMongocampAutoRefresh, kept pure so they can be tested without timers.

/** A refresh interval below this is raised to it: a live view must not hammer the server. */
export const MIN_REFRESH_INTERVAL_MS = 1000
export const DEFAULT_BACKOFF_FACTOR = 2
/** Default ceiling of the delay after repeated failures. */
export const DEFAULT_BACKOFF_MAX_MS = 5 * 60 * 1000

export interface BackoffOptions {
  /** Delay multiplier per consecutive failure (default 2). */
  factor?: number
  /** The delay never grows beyond this (default 5 minutes, never below the interval). */
  maxMs?: number
}

export function clampInterval(intervalMs: number): number {
  return Number.isFinite(intervalMs) ? Math.max(MIN_REFRESH_INTERVAL_MS, Math.floor(intervalMs)) : MIN_REFRESH_INTERVAL_MS
}

/** The wait before the next load: the interval, multiplied per consecutive failure up to the ceiling. */
export function nextDelay(intervalMs: number, failures: number, backoff: BackoffOptions | false = {}): number {
  const base = clampInterval(intervalMs)
  if (backoff === false || failures <= 0) return base
  const factor = Number.isFinite(backoff.factor) && backoff.factor! > 1 ? backoff.factor! : DEFAULT_BACKOFF_FACTOR
  const max = Math.max(base, backoff.maxMs ?? DEFAULT_BACKOFF_MAX_MS)
  // computed iteratively so a long failure streak cannot overflow to Infinity before the cap applies
  let delay = base
  for (let i = 0; i < failures && delay < max; i++) delay = Math.min(max, delay * factor)
  return delay
}
