import { useMongocampClientApi } from '#imports'
import { backupName, canCopyCollection, CollectionNotCopyableError } from '../utils/collectionCopy'
import { useMongocampBulkByFilter } from './useMongocampBulkByFilter'

export interface CopyOptions {
  source: string
  target: string
  /** Lucene filter: copy only the documents that match. */
  filter?: string
  /** Create the same indexes on the new collection (the server reproduces them from the real index specifications). */
  withIndexes?: boolean
  signal?: AbortSignal
}

export type CopyRefusal = 'target-exists'

export interface CopyResult {
  /** Why nothing was copied; absent when the copy ran. */
  refused?: CopyRefusal
  /** The new collection's name. */
  target: string
  /** How many documents the new collection holds. */
  count: number
  /** How many indexes (besides `_id_`) were created on it. */
  indexes: number
}

export interface BackupOptions extends Omit<CopyOptions, 'target'> {
  /** The time put into the name (default: now). */
  now?: Date
  /** Called with the chosen name before the request, so a UI can show it. */
  onTarget?: (target: string) => void
}

export interface RenameResult {
  refused?: CopyRefusal
  /** The collection's new name. */
  target: string
}

// the server answers 409 (code 4091, "send dropTarget true to replace it") for a target that exists
function isTargetExists(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 409
}

/**
 * Copy and rename a collection **inside the database** (server 1.8.1): one request, no cap, no browser memory — the server
 * copies with its own checks and, with `withIndexes`, recreates the indexes from the real index specifications (compound
 * order, partial filter, text weights, collation …). Grants, the schema and GridFS files are not copied; the copy is a
 * snapshot taken by the server. A name the server refuses (a target that exists: 409, a reserved one: 400) is thrown, except
 * "target exists", which is returned as `refused` so a dialog can offer another name.
 */
export function useMongocampCollectionCopy() {
  const { collectionApi } = useMongocampClientApi()
  const { countDocuments } = useMongocampBulkByFilter()

  async function listCollectionNames(): Promise<string[]> {
    return (await collectionApi.listCollections()) as string[]
  }

  async function copyCollection(options: CopyOptions): Promise<CopyResult> {
    const { source, target, filter, withIndexes, signal } = options
    try {
      const response = await collectionApi.copyCollection({
        collectionName: source,
        copyRequest: { target, filter: filter?.trim() ? filter : undefined, withIndexes: withIndexes ?? false },
      }, signal ? { signal } : undefined)
      return { target: response.name, count: response.count, indexes: response.indexes }
    }
    catch (error) {
      if (isTargetExists(error)) return { refused: 'target-exists', target, count: 0, indexes: 0 }
      throw error
    }
  }

  /**
   * A quick backup: copies `source` into a new collection named `<source>_backup_<yyyymmdd>_<hhmmss>` (a counter is
   * appended when that name exists) without asking for a name. If another session takes the name between the check and the
   * request, a new name is chosen (up to 3 attempts). Throws `CollectionNotCopyableError` for a source that cannot be copied.
   */
  async function backupCollection(options: BackupOptions): Promise<CopyResult> {
    if (!canCopyCollection(options.source)) throw new CollectionNotCopyableError(options.source)
    const { now, onTarget, ...copy } = options
    let result: CopyResult | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = backupName(options.source, await listCollectionNames(), now)
      onTarget?.(target)
      result = await copyCollection({ ...copy, target })
      if (result.refused !== 'target-exists') break
    }
    return result!
  }

  /**
   * Renames a collection (`POST …/rename`): the documents and indexes stay, the name changes. **Grants are by name**, so
   * every grant for the old name stops applying and none exists for the new one.
   */
  async function renameCollection(source: string, target: string, signal?: AbortSignal): Promise<RenameResult> {
    try {
      const response = await collectionApi.renameCollection({ collectionName: source, renameRequest: { target } }, signal ? { signal } : undefined)
      return { target: response.name }
    }
    catch (error) {
      if (isTargetExists(error)) return { refused: 'target-exists', target }
      throw error
    }
  }

  return { copyCollection, backupCollection, renameCollection, listCollectionNames, countDocuments }
}
