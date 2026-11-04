import { downloadTextFile } from '../utils/exportRows'
import { DEFAULT_EXPORT_MAX_ROWS, EXPORT_MIME_TYPES, exportFilename, formatDocuments, toExportRow } from '../utils/exportDocuments'
import type { ExportFormat } from '../utils/exportDocuments'
import type { FetchAllProgress } from '../utils/pagedFetch'
import { useMongocampFetchAll } from './useMongocampFetchAll'

export interface ExportCollectionOptions {
  collection: string
  format: ExportFormat
  /** Lucene filter: export only the documents that match (the current filter of a table). */
  filter?: string
  sort?: string[]
  /** Limit the fields; `columns` also orders a CSV. */
  projection?: string[]
  /** CSV columns in this order; default: the keys of all rows, `_id` first. */
  columns?: string[]
  /** Stop after this many documents (default 50 000) and report `truncated`. */
  maxRows?: number
  pageSize?: number
  onProgress?: (progress: FetchAllProgress) => void
  /** Aborting rejects with an `AbortError`; nothing is downloaded. */
  signal?: AbortSignal
  /** File name; default `<collection>-<yyyymmdd>-<hhmm>.<format>`. */
  filename?: string
  /** Hand the file to the browser as a download (default `true`). `false` only returns the text. */
  download?: boolean
}

export interface ExportResult {
  /** The file's text. */
  content: string
  filename: string
  mimeType: string
  format: ExportFormat
  /** Documents written. */
  rowCount: number
  /** The server's count when the last page was read. */
  total?: number
  /** More documents exist than were exported: the cap was hit. **The file is incomplete** — tell the user. */
  truncated: boolean
  /** Documents were added or removed while reading; the file may miss or repeat one. */
  totalChanged: boolean
}

/**
 * Exports a whole collection, or every document matching a filter, as JSON, NDJSON or CSV — not just the rows on screen.
 * It reads every page (`useMongocampFetchAll`: pages of 500, progress, abort) and writes the file in the browser. The rows
 * are written as the table shows them, except that an integer beyond 2^53 keeps every digit (bare number in JSON, digits
 * in CSV). Everything is held in memory: with the default cap of 50 000 documents that is tens of megabytes.
 */
export function useMongocampExportAll() {
  const { fetchAllDocuments } = useMongocampFetchAll()

  async function exportCollection(options: ExportCollectionOptions): Promise<ExportResult> {
    const { collection, format, columns, download = true } = options
    const fetched = await fetchAllDocuments<Record<string, unknown>>(collection, {
      filter: options.filter,
      sort: options.sort,
      projection: options.projection,
      pageSize: options.pageSize,
      maxRows: options.maxRows ?? DEFAULT_EXPORT_MAX_ROWS,
      onProgress: options.onProgress,
      signal: options.signal,
      // skip/limit paging can repeat a document when the collection changes during the read
      keyOf: row => String(row._id),
    })
    const rows = fetched.rows.map(toExportRow)
    const content = formatDocuments(rows, format, { columns })
    const filename = options.filename ?? exportFilename(collection, format)
    const mimeType = EXPORT_MIME_TYPES[format]
    if (download) downloadTextFile(filename, content, mimeType)
    return { content, filename, mimeType, format, rowCount: rows.length, total: fetched.total, truncated: fetched.truncated, totalChanged: fetched.totalChanged }
  }

  return { exportCollection }
}
