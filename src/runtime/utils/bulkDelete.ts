export interface BulkDeleteResult<T> {
  deleted: T[]
  failed: { item: T, error: unknown }[]
}

// Optional one-request-per-chunk deletion. `run` returns how many documents it deleted; anything
// but "all of them" (a smaller count, no count, an error) sends that chunk through the per-item
// `remove` instead. That fallback is safe to repeat: deleting a document that is already gone
// answers 200 with a count of 0, so the end state is the same either way.
export interface BulkRemoveMany<T> {
  run: (items: T[]) => Promise<number | undefined>
  // items it cannot address (e.g. ids the server will not take in a filter) go straight to `remove`
  canHandle?: (item: T) => boolean
  chunkSize?: number
}

const DEFAULT_CHUNK_SIZE = 100

// Deletes every item with `remove`, a few at a time, and reports which ones failed instead of
// stopping at the first error — a half-finished bulk delete must tell the caller exactly what is
// still there. Result arrays keep the input order. With `removeMany`, items it can handle go in
// chunks of one request each first; `run` is never called with an empty chunk (an empty filter
// would delete the whole collection).
export async function runBulkDelete<T>(
  items: T[],
  remove: (item: T) => Promise<unknown>,
  concurrency = 5,
  removeMany?: BulkRemoveMany<T>,
): Promise<BulkDeleteResult<T>> {
  const outcomes: ({ ok: true } | { ok: false, error: unknown })[] = Array.from({ length: items.length })
  const individually: number[] = []

  if (removeMany) {
    const chunkSize = Math.max(1, Math.floor(removeMany.chunkSize ?? DEFAULT_CHUNK_SIZE) || DEFAULT_CHUNK_SIZE)
    const batched: number[] = []
    items.forEach((item, index) => {
      if (removeMany.canHandle?.(item) ?? true) batched.push(index)
      else individually.push(index)
    })
    for (let start = 0; start < batched.length; start += chunkSize) {
      const indexes = batched.slice(start, start + chunkSize)
      try {
        const deletedCount = await removeMany.run(indexes.map(i => items[i]!))
        if (typeof deletedCount === 'number' && deletedCount >= indexes.length) {
          for (const i of indexes) outcomes[i] = { ok: true }
          continue
        }
      }
      catch {
        // fall through to the per-item path, which reports the real error per item
      }
      individually.push(...indexes)
    }
  }
  else {
    individually.push(...items.keys())
  }

  let next = 0
  async function worker() {
    while (next < individually.length) {
      const index = individually[next++]!
      try {
        await remove(items[index]!)
        outcomes[index] = { ok: true }
      }
      catch (error) {
        outcomes[index] = { ok: false, error }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, individually.length) }, worker))

  const result: BulkDeleteResult<T> = { deleted: [], failed: [] }
  items.forEach((item, index) => {
    const outcome = outcomes[index]!
    if (outcome.ok) result.deleted.push(item)
    else result.failed.push({ item, error: outcome.error })
  })
  return result
}
