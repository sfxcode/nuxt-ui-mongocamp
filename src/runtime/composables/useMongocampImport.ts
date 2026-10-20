import { useMongocampClientApi } from '#imports'
import useMongocampDocument from './useMongocampDocument'
import { runBatchInsert } from '../utils/batchInsert'
import type { BatchInsertResult } from '../utils/batchInsert'

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
        // the generated type says string values only; the server takes any JSON object
        return documentApi.insertMany({ collectionName, requestBody: batch as { [key: string]: string }[] }, { signal })
      },
      { batchSize: options.batchSize, signal: options.signal, onProgress: options.onProgress, isAtomicFailure: isRejectedBeforeWrite },
    )
  }

  return { importRows }
}
