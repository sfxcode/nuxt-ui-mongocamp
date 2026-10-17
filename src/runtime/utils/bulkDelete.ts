export interface BulkDeleteResult<T> {
  deleted: T[]
  failed: { item: T, error: unknown }[]
}

// Deletes every item with `remove`, a few at a time, and reports which ones failed instead of
// stopping at the first error — a half-finished bulk delete must tell the caller exactly what is
// still there. Result arrays keep the input order.
export async function runBulkDelete<T>(
  items: T[],
  remove: (item: T) => Promise<unknown>,
  concurrency = 5,
): Promise<BulkDeleteResult<T>> {
  const outcomes: ({ ok: true } | { ok: false, error: unknown })[] = Array.from({ length: items.length })
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      try {
        await remove(items[index]!)
        outcomes[index] = { ok: true }
      }
      catch (error) {
        outcomes[index] = { ok: false, error }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))

  const result: BulkDeleteResult<T> = { deleted: [], failed: [] }
  items.forEach((item, index) => {
    const outcome = outcomes[index]!
    if (outcome.ok) result.deleted.push(item)
    else result.failed.push({ item, error: outcome.error })
  })
  return result
}
