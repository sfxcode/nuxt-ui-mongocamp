// Wraps an async function so a burst of callers produces one run: concurrent calls share the run in
// flight, and for `cooldownMs` after a run finished its result is handed out again. Used for the requests
// the session diagnosis sends, so a page full of failing requests never turns into a flood of probes.
// A rejection is not cached — the next call may try again.

interface ThrottleOptions {
  now?: () => number
  cooldownMs?: number
}

export function createThrottled<T>(fn: () => Promise<T>, options: ThrottleOptions = {}): () => Promise<T> {
  const { now = Date.now, cooldownMs = 5000 } = options
  let inFlight: Promise<T> | null = null
  let last: { value: T, at: number } | null = null

  return function throttled() {
    if (inFlight) return inFlight
    if (last && now() - last.at < cooldownMs) return Promise.resolve(last.value)
    inFlight = fn().then((value) => {
      last = { value, at: now() }
      return value
    }).finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
