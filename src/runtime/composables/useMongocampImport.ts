import { useMongocampClientApi } from '#imports'
import useMongocampDocument from './useMongocampDocument'
import { runBatchInsert } from '../utils/batchInsert'
import type { BatchInsertResult } from '../utils/batchInsert'
import type { ImportResponse } from '@sfxcode/nuxt-mongocamp-server'

export type { BatchInsertResult } from '../utils/batchInsert'

// A 1 000-document batch takes well under a second; this only has to catch a hung server.
const BATCH_TIMEOUT_MS = 60000

export interface ImportRowsOptions {
  batchSize?: number
  signal?: AbortSignal
  onProgress?: (progress: { done: number, total: number }) => void
  // adds createdBy/updatedBy/timestamps from the signed-in user, like the single-document form
  stampMetadata?: boolean
}

// `ResponseError` for a 4xx: the server validates before writing, so nothing from that batch landed.
function isRejectedBeforeWrite(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  return status === 400
}

export function useMongocampImport() {
  const { documentApi } = useMongocampClientApi()
  const { ensureMetaData } = useMongocampDocument()

  async function importRows(collectionName: string, rows: Record<string, unknown>[], options: ImportRowsOptions = {}): Promise<BatchInsertResult> {
    const prepared = options.stampMetadata ? rows.map(row => ensureMetaData({ ...row })) : rows
    return runBatchInsert(
      prepared,
      (batch) => {
        const timeout = AbortSignal.timeout(BATCH_TIMEOUT_MS)
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
        // `ordered: false`: a document the server refuses (a duplicate key) no longer stops the rest of its batch — the answer
        // lists exactly which rows are missing. The generated type says string values only; the server takes any JSON object.
        return documentApi.insertMany({ collectionName, requestBody: batch as { [key: string]: string }[], ordered: false }, { signal })
      },
      { batchSize: options.batchSize, signal: options.signal, onProgress: options.onProgress, isAtomicFailure: isRejectedBeforeWrite },
    )
  }

  /**
   * Sends a NDJSON file (one JSON document per line, as the export writes it) to the server as it is — `POST …/documents/import`,
   * server 1.8.1. The file is the request body, so the browser streams it from disk and nothing is parsed or held here: no row
   * cap and no memory limit (the server's `IMPORT_MAX_BYTES` answers `413` above its size limit, and there is no time limit).
   * Each line is read like the body of an insert (extended-JSON wrappers, a timestamp-shaped string becomes a date); no
   * metadata is stamped. The documents are stored in unordered batches, so a line that cannot be stored does not stop the
   * others: the answer counts what was read, stored and failed and names the first failed lines (`errors[].index` is the
   * 1-based line number, blank lines count; `errorsTruncated` when there are more).
   */
  async function importNdjson(collectionName: string, file: Blob, options: { signal?: AbortSignal } = {}): Promise<ImportResponse> {
    // the generated client types the body as a string; a Blob is sent as it is
    return documentApi.importDocuments({ collectionName, body: file as unknown as string }, options.signal ? { signal: options.signal } : undefined)
  }

  return { importRows, importNdjson }
}
