// Runs `fn` over `items` with at most `limit` calls at a time (the server answers one collection per request, so a few in
// parallel are much faster than one after the other), keeps the input order of the results, never stops at a failure and
// stops *starting* new calls once `signal` aborts. Pure.

export type Settled<R> = { ok: true, value: R } | { ok: false, error: unknown }

export interface LimitedMapOptions {
  signal?: AbortSignal
  /** Called after every finished item with how many are done so far. */
  onProgress?: (done: number, total: number) => void
}

/**
 * The result of every item that was started, in input order; an item that never started (the run was aborted first) is
 * `undefined`. A rejected call is `{ ok: false, error }`, never thrown.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>, options: LimitedMapOptions = {}): Promise<Array<Settled<R> | undefined>> {
  const results: Array<Settled<R> | undefined> = Array.from({ length: items.length })
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  let next = 0
  let done = 0

  async function worker() {
    while (next < items.length && !options.signal?.aborted) {
      const index = next++
      try {
        results[index] = { ok: true, value: await fn(items[index]!, index) }
      }
      catch (error) {
        results[index] = { ok: false, error }
      }
      options.onProgress?.(++done, items.length)
    }
  }

  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
