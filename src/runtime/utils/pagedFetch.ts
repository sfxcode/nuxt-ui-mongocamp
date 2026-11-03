// Reads every page of a paged list endpoint, with a cap, progress and cancellation — the base of export-all, copying a
// collection, "select all N matching" and whole-collection analysis. Pure: the caller supplies how one page is fetched.
//
// What the server does (verified on MongoCamp 1.6.3 with a 20 000-document collection, 2026-11-03,
// brain/project/mongocamp-server-1-6-3-caveat-recheck.md):
// - `rowsPerPage` is honoured far beyond the default 100 (1 000 and even 100 000 in one request), so the page size is the
//   speed lever, not concurrency: 20 000 rows took 21 s at 100 per page, 4.7 s at 500, 2.8 s at 1 000;
// - the total comes in the `x-pagination-count-rows` header of every page; a page past the end is `200 []`;
// - `page` below 1 and `rowsPerPage` 0 are a `400` — never sent here;
// - deep pages cost almost nothing extra (page 1: 64 ms, page 190: 85 ms), and an unsorted list is repeatable.
// Paging is skip/limit, so a document added or removed while reading shifts later pages: the result may then miss or
// repeat a document. `keyOf` drops repeats; `totalChanged` tells the caller the collection moved under the read.

export const DEFAULT_PAGE_SIZE = 500
/** Callers raise this on purpose; an unbounded read of a large collection is never the default. */
export const DEFAULT_MAX_ROWS = 10_000

export interface PageResult<T> {
  rows: T[]
  /** Total number of rows the server reports for the whole list, when it does (the pagination header). */
  total?: number
}

export interface FetchAllProgress {
  loaded: number
  /** The server's total as of the latest page; `undefined` when it never reported one. */
  total?: number
  /** How many rows will be read at most: the total, capped at `maxRows`. */
  target?: number
  page: number
}

export interface FetchAllOptions<T> {
  /** Rows per request (default 500; the server accepts far more). */
  pageSize?: number
  /** Stop after this many rows and report `truncated` (default 10 000). */
  maxRows?: number
  onProgress?: (progress: FetchAllProgress) => void
  /** Aborting rejects with an `AbortError` — a half-read result is never returned as if it were complete. */
  signal?: AbortSignal
  /** Identity of a row, to drop a row that appears twice because the list shifted while reading. */
  keyOf?: (row: T) => string
}

export interface FetchAllResult<T> {
  rows: T[]
  /** The server's total as of the latest page. */
  total?: number
  /** More rows exist than were read: the cap was hit. */
  truncated: boolean
  /** The reported total was not the same on every page — rows were added or removed during the read. */
  totalChanged: boolean
  /** Rows skipped because `keyOf` had already seen them. */
  duplicates: number
  pages: number
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * Calls `fetchPage(page, pageSize)` for page 1, 2, … until everything is read, the cap is reached or `signal` aborts.
 * Stops when the rows read reach the server's latest total, on an empty page, or — only when the server never reports a
 * total — on a page shorter than asked for (a server may cap the page size, so a short page alone proves nothing).
 * Sequential by design: the pages are cheap to compute and the page size is what makes it fast.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageResult<T>>,
  options: FetchAllOptions<T> = {},
): Promise<FetchAllResult<T>> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  const maxRows = Math.max(1, Math.floor(options.maxRows ?? DEFAULT_MAX_ROWS) || DEFAULT_MAX_ROWS)
  const { signal, onProgress, keyOf } = options

  const rows: T[] = []
  const seen = keyOf ? new Set<string>() : undefined
  let total: number | undefined
  let totalChanged = false
  let duplicates = 0
  let truncated = false
  let page = 0

  for (;;) {
    if (signal?.aborted) throw abortError(signal)
    page++
    const result = await fetchPage(page, pageSize)
    if (signal?.aborted) throw abortError(signal)

    if (typeof result.total === 'number' && Number.isFinite(result.total)) {
      if (total !== undefined && result.total !== total) totalChanged = true
      total = result.total
    }

    let added = 0
    for (const row of result.rows) {
      if (seen && keyOf) {
        const key = keyOf(row)
        if (seen.has(key)) {
          duplicates++
          continue
        }
        seen.add(key)
      }
      if (rows.length >= maxRows) {
        truncated = true
        break
      }
      rows.push(row)
      added++
    }

    onProgress?.({ loaded: rows.length, total, target: total === undefined ? undefined : Math.min(total, maxRows), page })

    if (truncated) break
    // the cap is reached exactly: more exist only if the server says so (or, without a total, we cannot know — assume so)
    if (rows.length >= maxRows) {
      truncated = total === undefined ? result.rows.length >= pageSize : total > rows.length + duplicates
      break
    }
    if (result.rows.length === 0) break
    // a page of nothing but rows already seen: the server is not advancing (it would repeat forever without a total)
    if (keyOf && added === 0) break
    if (total !== undefined) {
      if (rows.length + duplicates >= total) break
    }
    else if (result.rows.length < pageSize) {
      break
    }
  }

  return { rows, total, truncated, totalChanged, duplicates, pages: page }
}
