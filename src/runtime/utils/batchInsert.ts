export interface BatchInsertFailure {
  // index of the batch's first row in the input, and how many rows the batch held
  start: number
  count: number
  error: unknown
  // false only when the server is known to reject a batch before writing anything
  mayBePartial: boolean
}

export interface BatchInsertResult {
  inserted: number
  failedBatches: BatchInsertFailure[]
  // rows never sent because the run was aborted
  skipped: number
  aborted: boolean
}

export interface BatchInsertOptions {
  batchSize?: number
  signal?: AbortSignal
  onProgress?: (progress: { done: number, total: number }) => void
  // The server validates a batch before writing (a bad element fails the whole batch with
  // nothing inserted) but a write error such as a duplicate key can leave part of it behind.
  isAtomicFailure?: (error: unknown) => boolean
}

const DEFAULT_BATCH_SIZE = 1000
const MAX_BATCH_SIZE = 10_000

// Sends `rows` to `insert` one batch at a time (in order, never in parallel) and reports every
// failed batch instead of stopping at the first one — a half-finished import must say exactly
// which rows are missing. Never calls `insert` with an empty batch: the server answers 500 for it.
export async function runBatchInsert<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
  options: BatchInsertOptions = {},
): Promise<BatchInsertResult> {
  const batchSize = Math.min(Math.max(Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE)
  const result: BatchInsertResult = { inserted: 0, failedBatches: [], skipped: 0, aborted: false }
  let done = 0

  for (let start = 0; start < rows.length; start += batchSize) {
    if (options.signal?.aborted) {
      result.aborted = true
      result.skipped = rows.length - start
      break
    }
    const batch = rows.slice(start, start + batchSize)
    try {
      await insert(batch)
      result.inserted += batch.length
    }
    catch (error) {
      result.failedBatches.push({ start, count: batch.length, error, mayBePartial: !(options.isAtomicFailure?.(error) ?? false) })
    }
    done += batch.length
    options.onProgress?.({ done, total: rows.length })
  }
  return result
}
