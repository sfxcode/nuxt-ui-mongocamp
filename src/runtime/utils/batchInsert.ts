export interface BatchInsertFailure {
  // index of the batch's first row in the input, and how many rows the batch held
  start: number
  count: number
  error: unknown
  // false only when the server is known to reject a batch before writing anything
  mayBePartial: boolean
}

// One row the server refused while it wrote the rest of its batch (`insertMany` with `ordered=false`, server 1.7.0).
export interface BatchInsertRowError {
  // position of the row in the whole input
  index: number
  // MongoDB write error code (11000 = duplicate key), when the server gave one
  code?: number
  message: string
}

export interface BatchInsertResult {
  inserted: number
  failedBatches: BatchInsertFailure[]
  // rows refused one by one inside batches that otherwise went through — exactly the rows that are missing
  rowErrors: BatchInsertRowError[]
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

// Rows the server refused one by one become failures like any other, so the callers' lists and "retry failed rows" keep
// working: neighbouring rows with the same message are one range (1 000 duplicates in a row are one line, not 1 000).
// They are known not to have been written, so a retry cannot duplicate them.
function rowErrorsAsFailures(rowErrors: BatchInsertRowError[]): BatchInsertFailure[] {
  const failures: BatchInsertFailure[] = []
  for (const e of [...rowErrors].sort((a, b) => a.index - b.index)) {
    const last = failures.at(-1)
    const lastMessage = (last?.error as { message?: string } | undefined)?.message
    if (last && last.start + last.count === e.index && lastMessage === e.message) {
      last.count++
      continue
    }
    failures.push({ start: e.index, count: 1, error: Object.assign(new Error(e.message), { code: e.code }), mayBePartial: false })
  }
  return failures
}

// What `insertMany` answers: how many documents landed and which positions of the batch did not.
interface InsertSummary {
  insertedCount?: unknown
  errors?: unknown
}

function readSummary(value: unknown): { insertedCount: number, errors: { index: number, code?: number, message: string }[] } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { insertedCount, errors } = value as InsertSummary
  if (typeof insertedCount !== 'number') return undefined
  const list = Array.isArray(errors) ? errors : []
  return {
    insertedCount,
    errors: list.flatMap((e: unknown) => {
      const { index, code, message } = (e ?? {}) as { index?: unknown, code?: unknown, message?: unknown }
      return typeof index === 'number' ? [{ index, code: typeof code === 'number' ? code : undefined, message: typeof message === 'string' ? message : '' }] : []
    }),
  }
}

// Sends `rows` to `insert` one batch at a time (in order, never in parallel) and reports every
// failed batch instead of stopping at the first one — a half-finished import must say exactly
// which rows are missing. Never calls `insert` with an empty batch: the server answers 500 for it.
export async function runBatchInsert<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
  options: BatchInsertOptions = {},
): Promise<BatchInsertResult> {
  const batchSize = Math.min(Math.max(Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE)
  const result: BatchInsertResult = { inserted: 0, failedBatches: [], rowErrors: [], skipped: 0, aborted: false }
  let done = 0

  for (let start = 0; start < rows.length; start += batchSize) {
    if (options.signal?.aborted) {
      result.aborted = true
      result.skipped = rows.length - start
      break
    }
    const batch = rows.slice(start, start + batchSize)
    try {
      // an answer with counts and per-row errors says exactly what landed; anything else is taken as "the whole batch"
      const summary = readSummary(await insert(batch))
      result.inserted += summary ? summary.insertedCount : batch.length
      for (const e of summary?.errors ?? []) result.rowErrors.push({ index: start + e.index, code: e.code, message: e.message })
    }
    catch (error) {
      result.failedBatches.push({ start, count: batch.length, error, mayBePartial: !(options.isAtomicFailure?.(error) ?? false) })
    }
    done += batch.length
    options.onProgress?.({ done, total: rows.length })
  }
  if (result.rowErrors.length > 0) result.failedBatches = [...result.failedBatches, ...rowErrorsAsFailures(result.rowErrors)].sort((a, b) => a.start - b.start)
  return result
}
