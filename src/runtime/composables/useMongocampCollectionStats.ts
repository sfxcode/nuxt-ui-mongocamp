import { useMongocampClientApi } from '#imports'
import { mapIndexUsage, mapStorage } from '../utils/collectionStats'
import type { CollectionStorage, IndexUsage } from '../utils/collectionStats'
import { useMongocampAggregation } from './useMongocampAggregation'

export type { CollectionStorage, IndexUsage } from '../utils/collectionStats'

const REQUEST_TIMEOUT_MS = 15000

/**
 * Typed storage and index-usage numbers of one collection. Both come from the server with a 15 s limit; neither shows
 * the database's host, namespace or an index spec.
 */
export function useMongocampCollectionStats() {
  const { collectionApi } = useMongocampClientApi()
  const { runAggregation } = useMongocampAggregation()

  /** From `getCollectionInformation`: document count, sizes in bytes, number and size of the indexes. */
  async function getStorage(collection: string): Promise<CollectionStorage> {
    const status = await collectionApi.getCollectionInformation({ collectionName: collection }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    return mapStorage(status)
  }

  /** From `$indexStats`: how often each index was used since the server counted. Runs the stage through the gated internal path. */
  async function getIndexUsage(collection: string): Promise<IndexUsage[]> {
    const { rows } = await runAggregation(collection, [{ stage: '$indexStats', value: {} }], { rowsPerPage: 1000 }, { allowStatsStages: true })
    return mapIndexUsage(rows)
  }

  return { getStorage, getIndexUsage }
}
