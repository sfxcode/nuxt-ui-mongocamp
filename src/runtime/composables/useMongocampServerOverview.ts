import { useMongocampClientApi } from '#imports'
import type { DatabaseInfo, JobInformation } from '@sfxcode/nuxt-mongocamp-server'
import { toCollectionStat } from '../utils/serverOverview'
import type { CollectionStat } from '../utils/serverOverview'
import { useMongocampJobs } from './useMongocampJobs'
import { useMongocampSystem } from './useMongocampSystem'
import type { ServerCluster } from './useMongocampSystem'

export type { CollectionStat } from '../utils/serverOverview'

export interface ServerOverviewOptions {
  /** Read at most this many collections (default 200); the rest is counted in `skipped`. */
  maxCollections?: number
  /** Aborting rejects with an `AbortError`. */
  signal?: AbortSignal
}

export interface ServerOverview {
  /** `null` when the databases could not be read (see `errors.databases`). */
  databases: DatabaseInfo[] | null
  /** The collections that were read, in the server's order (MongoCamp's own `mc_*` collections are left out). */
  collections: CollectionStat[]
  /** How many collections there are in all. */
  collectionCount: number
  /** Collections not read because of `maxCollections`. */
  skipped: number
  /** Collections the server listed but could not read the numbers of (`available: false`). */
  failed: string[]
  cluster: ServerCluster | null
  jobs: JobInformation[] | null
  /** The first error of each part that failed; the other parts still hold their data. */
  errors: Partial<Record<'databases' | 'collections' | 'cluster' | 'jobs', unknown>>
}

const REQUEST_TIMEOUT_MS = 15000
const DEFAULT_MAX_COLLECTIONS = 200

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * What an admin wants to see first: the databases, the size of every collection, the cluster and the scheduled jobs. The
 * parts are independent — one that fails is reported in `errors` and leaves the others intact. The numbers of **all**
 * collections come in one request (`GET /mongodb/collections/info`, server 1.7.0); `maxCollections` only limits how many of
 * them are kept. Aborting rejects with an `AbortError`.
 */
export function useMongocampServerOverview() {
  const { collectionApi } = useMongocampClientApi()
  const { getDatabaseInfos, getCluster } = useMongocampSystem()
  const { listJobs } = useMongocampJobs()

  async function loadOverview(options: ServerOverviewOptions = {}): Promise<ServerOverview> {
    const { signal } = options
    if (signal?.aborted) throw abortError()
    const maxCollections = Math.max(0, Math.floor(options.maxCollections ?? DEFAULT_MAX_COLLECTIONS))
    const errors: ServerOverview['errors'] = {}

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const init = { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }
    const [databases, summaries, cluster, jobs] = await Promise.allSettled([getDatabaseInfos(), collectionApi.listCollectionInformation({}, init), getCluster(), listJobs()])
    if (signal?.aborted) throw abortError()

    const result: ServerOverview = {
      databases: databases.status === 'fulfilled' ? databases.value : null,
      collections: [],
      collectionCount: 0,
      skipped: 0,
      failed: [],
      cluster: cluster.status === 'fulfilled' ? cluster.value : null,
      jobs: jobs.status === 'fulfilled' ? jobs.value : null,
      errors,
    }
    if (databases.status === 'rejected') errors.databases = databases.reason
    if (cluster.status === 'rejected') errors.cluster = cluster.reason
    if (jobs.status === 'rejected') errors.jobs = jobs.reason
    if (summaries.status === 'rejected') {
      errors.collections = summaries.reason
      return result
    }

    const own = summaries.value.filter(summary => !summary.name.startsWith('mc_'))
    result.collectionCount = own.length
    const kept = own.slice(0, maxCollections)
    result.skipped = own.length - kept.length
    for (const summary of kept) {
      if (summary.available === false) result.failed.push(summary.name)
      else result.collections.push(toCollectionStat(summary.name, summary))
    }
    return result
  }

  return { loadOverview }
}
