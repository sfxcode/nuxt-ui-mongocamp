import { useMongocampClientApi } from '#imports'

export interface BulkUpdateByFilterResult {
  matched: number
  modified: number
}

/**
 * Count, delete and update by the **Lucene filter** of the list — one request each (server 1.7.0): no ids are collected,
 * so there is no cap, no id snapshot and nothing to chunk. An empty filter would touch the whole collection, which the
 * server only does with `matchAll=true`; it is sent exactly when the filter is empty, so the caller's own confirmation
 * (the typed collection name) is what guards that case. A filter the server cannot parse is answered 400 (nothing changes).
 */
export function useMongocampBulkByFilter() {
  const { documentApi } = useMongocampClientApi()

  const clean = (filter?: string): string | undefined => (filter && filter.trim() !== '' ? filter : undefined)

  /** How many documents match (`GET .../documents/count`). */
  async function countDocuments(collectionName: string, filter?: string, signal?: AbortSignal): Promise<number> {
    const response = await documentApi.countDocuments({ collectionName, filter: clean(filter) }, signal ? { signal } : undefined)
    return response.count
  }

  /** Deletes every document the filter matches; resolves with the server's `deletedCount`. */
  async function deleteByFilter(collectionName: string, filter?: string, signal?: AbortSignal): Promise<number> {
    const lucene = clean(filter)
    // the body must be `{}`: the server refuses a filter in both places (code 4004)
    const response = await documentApi.deleteMany(
      { collectionName, requestBody: {}, filter: lucene, matchAll: lucene === undefined ? true : undefined },
      signal ? { signal } : undefined,
    )
    return response.deletedCount
  }

  /** Sets the given fields on every document the filter matches (`$set` semantics of `updateMany`). */
  async function updateByFilter(collectionName: string, filter: string | undefined, document: Record<string, unknown>, signal?: AbortSignal): Promise<BulkUpdateByFilterResult> {
    const lucene = clean(filter)
    const response = await documentApi.updateMany(
      {
        collectionName,
        // the generated type says string values only; the server takes any JSON value
        updateRequest: { filter: {}, document: document as { [key: string]: string } },
        filter: lucene,
        matchAll: lucene === undefined ? true : undefined,
      },
      signal ? { signal } : undefined,
    )
    return { matched: response.matchedCount, modified: response.modifiedCount }
  }

  return { countDocuments, deleteByFilter, updateByFilter }
}
