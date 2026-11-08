import { useMongocampClientApi } from '#imports'
import { downloadBlob } from '../utils/exportRows'
import { EXPORT_MIME_TYPES, exportFilename } from '../utils/exportDocuments'
import type { ExportFormat } from '../utils/exportDocuments'
import { FilterTooLongError } from '../utils/aggregationErrors'
import { isFilterTooLong, MAX_ENCODED_FILTER_LENGTH } from '../utils/requestLimits'

export interface ExportCollectionOptions {
  collection: string
  format: ExportFormat
  /** Lucene filter: export only the documents that match (the current filter of a table). It travels in the URL: over ~1 800 encoded characters it throws `FilterTooLongError`. */
  filter?: string
  sort?: string[]
  /** Limit the fields; for a CSV they are also its columns, in this order (default: the fields of the first 1 000 documents). */
  projection?: string[]
  /** CSV columns in this order — the same as `projection`, kept for the old name. */
  columns?: string[]
  /** Stop after this many documents (`limit`); default: all. */
  maxRows?: number
  /** How many documents the caller expects (the count of the filter): a file with fewer is reported as `incomplete`. */
  expected?: number
  /** After every chunk of the stream. */
  onProgress?: (progress: ExportProgress) => void
  /** Aborting rejects with an `AbortError`; nothing is downloaded. */
  signal?: AbortSignal
  /** File name; default `<collection>-<yyyymmdd>-<hhmm>.<format>`. */
  filename?: string
  /** Hand the file to the browser as a download (default `true`). `false` only returns the blob. */
  download?: boolean
}

export interface ExportProgress {
  /** Bytes received so far. */
  bytes: number
  /** Lines received so far (NDJSON: documents; CSV: documents + the header, unless a value holds a line break). */
  lines: number
}

export interface ExportResult {
  blob: Blob
  filename: string
  mimeType: string
  format: ExportFormat
  bytes: number
  /** Documents in the file: exact for NDJSON (one per line); for JSON and CSV the expected count when the file is complete. */
  documents?: number
  /**
   * The file is certainly **cut short**: the server ends a stream that fails midway with a normal `200`, so the file is checked
   * — JSON must end with `]`, NDJSON and CSV must hold at least the expected number of documents. Tell the user.
   */
  incomplete: boolean
}

// Counts bytes and line breaks while the stream passes; nothing is held here (the Blob behind `new Response(stream)` is the
// browser's own storage, which can live on disk).
function countingStream(onProgress: ((progress: ExportProgress) => void) | undefined) {
  const state = { bytes: 0, newlines: 0, last: 0 }
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      state.bytes += chunk.length
      for (const byte of chunk) if (byte === 10) state.newlines++
      if (chunk.length > 0) state.last = chunk[chunk.length - 1]!
      onProgress?.({ bytes: state.bytes, lines: state.newlines + (state.last !== 10 && state.bytes > 0 ? 1 : 0) })
      controller.enqueue(chunk)
    },
  })
  return { stream, state }
}

/**
 * Exports a whole collection, or every document matching a filter, as JSON, NDJSON or CSV — not just the rows on screen.
 * The server streams the file (`GET …/documents/export`, server 1.8.1): there is no document cap and the browser never parses
 * a document. Values are written as plain JSON, so an integer beyond 2^53 keeps every digit as the text the server wrote.
 * The file ends up in a `Blob` (the browser may keep it on disk) and is handed to the browser as a download.
 */
export function useMongocampExportAll() {
  const { documentApi } = useMongocampClientApi()

  async function exportCollection(options: ExportCollectionOptions): Promise<ExportResult> {
    const { collection, format, download = true } = options
    if (isFilterTooLong(options.filter)) throw new FilterTooLongError(MAX_ENCODED_FILTER_LENGTH)
    const projection = options.projection?.length ? options.projection : options.columns?.length ? options.columns : undefined
    const response = await documentApi.exportDocumentsRaw({
      collectionName: collection,
      format,
      filter: options.filter?.trim() ? options.filter : undefined,
      sort: options.sort?.length ? options.sort : undefined,
      projection,
      limit: options.maxRows,
    }, options.signal ? { signal: options.signal } : undefined)

    const mimeType = EXPORT_MIME_TYPES[format]
    const { stream, state } = countingStream(options.onProgress)
    const body = response.raw.body
    const blob = body
      ? await new Response(body.pipeThrough(stream), { headers: { 'content-type': mimeType } }).blob()
      : await response.raw.blob()
    const bytes = body ? state.bytes : blob.size
    const lines = body ? state.newlines + (state.last !== 10 && state.bytes > 0 ? 1 : 0) : 0

    const wanted = options.expected === undefined ? undefined : Math.min(options.expected, options.maxRows ?? Infinity)
    let incomplete: boolean
    let documents: number | undefined
    if (format === 'json') {
      incomplete = !(await blob.slice(Math.max(0, bytes - 8)).text()).trimEnd().endsWith(']')
      if (!incomplete) documents = wanted
    }
    else if (format === 'ndjson') {
      documents = lines
      incomplete = wanted !== undefined && lines < wanted
    }
    else {
      // a header line and one line per document; a value with a line break only adds lines, so fewer is certainly short
      incomplete = wanted !== undefined && lines - 1 < wanted
      if (!incomplete) documents = wanted
    }

    const filename = options.filename ?? exportFilename(collection, format)
    if (download) downloadBlob(filename, blob)
    return { blob, filename, mimeType, format, bytes, documents, incomplete }
  }

  return { exportCollection }
}
