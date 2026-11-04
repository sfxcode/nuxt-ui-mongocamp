import { useMongocampClientApi } from '#imports'
import { readJsonKeepingLongs } from '../utils/bigIntJson'
import { backupName, canCopyCollection, CollectionNotCopyableError, MAX_COPY_DOCUMENTS } from '../utils/collectionCopy'
import { headerNumber } from '../utils/paginationHeaders'
import { useMongocampFetchAll } from './useMongocampFetchAll'
import { planIndexCopies } from '../utils/indexCopy'
import type { IndexCopySkipReason } from '../utils/indexCopy'
import { useMongocampImport } from './useMongocampImport'
import { useMongocampIndex } from './useMongocampIndex'
import type { BatchInsertResult } from './useMongocampImport'

export interface CopyProgress {
  phase: 'reading' | 'writing' | 'indexes'
  done: number
  total: number
}

export interface CopyOptions {
  source: string
  target: string
  /** Lucene filter: copy only the documents that match. */
  filter?: string
  /** Refuse above this many documents (default 50 000) — nothing is read or written then. */
  maxDocuments?: number
  onProgress?: (progress: CopyProgress) => void
  /**
   * Create the same indexes on the new collection after the documents were written (all but `_id_`). Only when every batch
   * was written; kinds the API cannot express are skipped and reported in `indexes`.
   */
  copyIndexes?: boolean
  /** Aborting while reading writes nothing; while writing it leaves a partly filled target (`aborted`, `skipped`). */
  signal?: AbortSignal
}

export type CopyRefusal = 'target-exists' | 'too-many-documents'

export interface BackupOptions extends Omit<CopyOptions, 'target'> {
  /** The time put into the name (default: now). */
  now?: Date
  /** Called with the chosen name before anything is read, so a UI can show it. */
  onTarget?: (target: string) => void
}

export interface IndexCopyResult {
  /** Names of the indexes created on the target. */
  copied: string[]
  /** Indexes that cannot be reproduced through the API, with why (nothing is approximated). */
  skipped: Array<{ name: string, reason: IndexCopySkipReason }>
  /** Indexes the server refused on the target. */
  failed: Array<{ name: string, error: unknown }>
}

export interface CopyResult {
  /** Why nothing was copied; absent when the copy ran. */
  refused?: CopyRefusal
  /** How many documents the source (or the filter) holds, as the server reported before reading. */
  sourceTotal: number
  /** The documents read, in order — kept so failed batches can be retried. Empty when refused. */
  rows: Record<string, unknown>[]
  inserted: number
  failedBatches: BatchInsertResult['failedBatches']
  skipped: number
  aborted: boolean
  /** Documents were added or removed in the source while it was read. */
  totalChanged: boolean
  /** Present when `copyIndexes` was asked for and the documents were all written (or there were none). */
  indexes?: IndexCopyResult
  /** The indexes of the source could not be listed (`indexes` is then absent). */
  indexesError?: unknown
}

const READ_PAGE_SIZE = 1000

/**
 * Copies the documents of one collection into a NEW one: reads every page of the source, then inserts them in batches.
 * Documents are copied as the server gives them, `_id` included (verified on server 1.6.3: dates, 64-bit integers and ids
 * come out with the same types and the read-back text is identical). Grants, the schema and GridFS files are never
 * copied, indexes only with `copyIndexes`. It is not atomic and not a snapshot: the source may change while it is read.
 */
export function useMongocampCollectionCopy() {
  const { collectionApi, documentApi } = useMongocampClientApi()
  const { fetchAllDocuments } = useMongocampFetchAll()
  const { importRows } = useMongocampImport()
  const { listIndexes, createIndex, createTextIndex } = useMongocampIndex()

  async function listCollectionNames(): Promise<string[]> {
    return (await collectionApi.listCollections()) as string[]
  }

  /** How many documents match (a one-row request, only the pagination header is used). */
  async function countDocuments(collection: string, filter?: string): Promise<number> {
    const response = await documentApi.listDocumentsRaw({ collectionName: collection, filter, rowsPerPage: 1, page: 1 })
    return headerNumber(response.raw?.headers, 'x-pagination-count-rows') ?? (await readJsonKeepingLongs<unknown[]>(response)).length
  }

  /** The document count of a collection as the server reports it now (what the finished copy is checked against). */
  async function collectionCount(collection: string): Promise<number> {
    return (await collectionApi.getCollectionInformation({ collectionName: collection })).count
  }

  /**
   * Recreates the indexes of `source` on `target` (all but `_id_`): name, field order, unique flag, expiry and one-field text
   * indexes. What the API cannot express (a text index over several fields, custom text weights, special key types, the order
   * of a custom-named compound index) is skipped and listed; an index the server refuses is listed as failed. Run it after
   * the documents are in place: building an index once over the finished data is faster than keeping it up to date.
   */
  async function copyIndexes(source: string, target: string, onProgress?: (done: number, total: number) => void): Promise<IndexCopyResult> {
    const plans = planIndexCopies(await listIndexes(source))
    const result: IndexCopyResult = { copied: [], skipped: [], failed: [] }
    let done = 0
    for (const plan of plans) {
      if (plan.call === 'skip') {
        result.skipped.push({ name: plan.name, reason: plan.reason })
      }
      else {
        try {
          if (plan.call === 'createTextIndex') await createTextIndex(target, plan.field)
          else await createIndex(target, plan.keys, plan.options)
          result.copied.push(plan.name)
        }
        catch (error) {
          result.failed.push({ name: plan.name, error })
        }
      }
      onProgress?.(++done, plans.length)
    }
    return result
  }

  async function copyCollection(options: CopyOptions): Promise<CopyResult> {
    const { source, target, filter, signal } = options
    const cap = options.maxDocuments ?? MAX_COPY_DOCUMENTS
    const empty = { rows: [], inserted: 0, failedBatches: [], skipped: 0, aborted: false, totalChanged: false }

    // checked again right before writing: the name was free when the user typed it, another session may have used it since
    if ((await listCollectionNames()).some(name => name.toLowerCase() === target.toLowerCase())) return { ...empty, refused: 'target-exists', sourceTotal: 0 }

    const sourceTotal = await countDocuments(source, filter)
    // a copy that silently stops at a cap would look complete; refuse before anything is read or written
    if (sourceTotal > cap) return { ...empty, refused: 'too-many-documents', sourceTotal }

    const read = await fetchAllDocuments<Record<string, unknown>>(source, {
      filter,
      pageSize: READ_PAGE_SIZE,
      maxRows: cap,
      signal,
      // skip/limit paging can repeat a document when the source changes during the read
      keyOf: row => String(row._id),
      onProgress: p => options.onProgress?.({ phase: 'reading', done: p.loaded, total: p.target ?? sourceTotal }),
    })
    const rows = read.rows
    const written = rows.length === 0
      ? { inserted: 0, failedBatches: [], skipped: 0, aborted: false }
      : await importRows(target, rows, {
          signal,
          onProgress: p => options.onProgress?.({ phase: 'writing', done: p.done, total: p.total }),
        })
    const result: CopyResult = {
      sourceTotal,
      rows,
      inserted: written.inserted,
      failedBatches: written.failedBatches,
      skipped: written.skipped,
      aborted: written.aborted,
      totalChanged: read.totalChanged,
    }
    // indexes only on a finished copy: after a failure or a stop the new collection is incomplete anyway, and the dialog
    // creates them after a successful retry
    if (options.copyIndexes && !written.aborted && written.failedBatches.length === 0) {
      try {
        result.indexes = await copyIndexes(source, target, (done, total) => options.onProgress?.({ phase: 'indexes', done, total }))
      }
      catch (error) {
        result.indexesError = error
      }
    }
    return result
  }

  /**
   * A quick backup: copies `source` into a new collection named `<source>_backup_<yyyymmdd>_<hhmmss>` (a counter is
   * appended when that name exists) without asking for a name. The same copy as `copyCollection`, with the same cap,
   * progress, abort and result; `target` says where it went. If another session takes the name between the check and the
   * write, a new name is chosen once more.
   */
  async function backupCollection(options: BackupOptions): Promise<CopyResult & { target: string }> {
    if (!canCopyCollection(options.source)) throw new CollectionNotCopyableError(options.source)
    const { now, onTarget, ...copy } = options
    let result: CopyResult & { target: string } | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = backupName(options.source, await listCollectionNames(), now)
      onTarget?.(target)
      result = { ...await copyCollection({ ...copy, target }), target }
      if (result.refused !== 'target-exists') break
    }
    return result!
  }

  /** Sends the rows of the failed batches again (the importer's retry); returns what that run inserted and what failed. */
  async function retryBatches(target: string, rows: Record<string, unknown>[], failed: BatchInsertResult['failedBatches'], options: Pick<CopyOptions, 'signal' | 'onProgress'> = {}) {
    const again = failed.flatMap(batch => rows.slice(batch.start, batch.start + batch.count))
    const result = await importRows(target, again, {
      signal: options.signal,
      onProgress: p => options.onProgress?.({ phase: 'writing', done: p.done, total: p.total }),
    })
    return { rows: again, ...result }
  }

  return { copyCollection, copyIndexes, backupCollection, retryBatches, listCollectionNames, countDocuments, collectionCount }
}
