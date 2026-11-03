import { useMongocampClientApi } from '#imports'
import { readJsonKeepingLongs } from '../utils/bigIntJson'
import { fetchAllPages } from '../utils/pagedFetch'
import type { FetchAllOptions, FetchAllResult } from '../utils/pagedFetch'
import { headerNumber } from '../utils/paginationHeaders'

const PAGE_TIMEOUT_MS = 60_000

export interface FetchAllDocumentsOptions<T> extends FetchAllOptions<T> {
  /** Lucene filter, as for the document list. */
  filter?: string
  /** Sort keys as the document list takes them (`['name', '-age']`). Without one the server's natural order is used. */
  sort?: string[]
  /** Fields to return; `['_id']` is the cheap way to collect ids. */
  projection?: string[]
}

export interface FetchAllFilesOptions<T> extends FetchAllOptions<T> {
  filter?: string
  sort?: string
  projection?: string
}

// one request is bounded by the timeout *and* by the caller's signal
function requestInit(signal: AbortSignal | undefined): RequestInit {
  const timeout = AbortSignal.timeout(PAGE_TIMEOUT_MS)
  // an older browser without AbortSignal.any keeps the timeout; the caller's abort is still honoured between pages
  return { signal: signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout }
}

/**
 * Reads every document of a collection (or of a Lucene filter) page by page: `fetchAllPages` over the document list. The
 * rows are what the list returns — read from the response text, so integers beyond 2^53 are `{ $numberLong }` wrappers
 * (run them through `unwrapExtendedJson` for display) — and the total comes from the pagination header.
 * Capped at 10 000 rows by default (`maxRows` raises it); see `utils/pagedFetch.ts` for stopping, progress, abort and
 * the effect of documents changing during the read. Every page has its own 60 s timeout.
 */
export function useMongocampFetchAll() {
  const { documentApi, fileApi } = useMongocampClientApi()

  async function fetchAllDocuments<T = Record<string, unknown>>(collectionName: string, options: FetchAllDocumentsOptions<T> = {}): Promise<FetchAllResult<T>> {
    const { filter, sort, projection, ...paging } = options
    return fetchAllPages<T>(async (page, pageSize) => {
      const response = await documentApi.listDocumentsRaw({ collectionName, filter, sort, projection, page, rowsPerPage: pageSize }, requestInit(options.signal))
      return { rows: await readJsonKeepingLongs<T[]>(response), total: headerNumber(response.raw?.headers, 'x-pagination-count-rows') }
    }, paging)
  }

  /** The same for the files of a GridFS bucket (`FileInformation` rows). */
  async function fetchAllFiles<T = Record<string, unknown>>(bucketName: string, options: FetchAllFilesOptions<T> = {}): Promise<FetchAllResult<T>> {
    const { filter, sort, projection, ...paging } = options
    return fetchAllPages<T>(async (page, pageSize) => {
      const response = await fileApi.listFilesRaw({ bucketName, filter, sort, projection, page, rowsPerPage: pageSize }, requestInit(options.signal))
      return { rows: await readJsonKeepingLongs<T[]>(response), total: headerNumber(response.raw?.headers, 'x-pagination-count-rows') }
    }, paging)
  }

  return { fetchAllDocuments, fetchAllFiles }
}
