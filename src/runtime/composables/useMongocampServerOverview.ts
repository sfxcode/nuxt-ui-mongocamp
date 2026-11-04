import { useMongocampClientApi } from '#imports'
import type { DatabaseInfo, JobInformation } from '@sfxcode/nuxt-mongocamp-server'
import { mapLimit } from '../utils/limitedMap'
import { toCollectionStat } from '../utils/serverOverview'
import type { CollectionStat } from '../utils/serverOverview'
import { useMongocampJobs } from './useMongocampJobs'
import { useMongocampSystem } from './useMongocampSystem'
import type { ServerCluster } from './useMongocampSystem'

export type { CollectionStat } from '../utils/serverOverview'

export interface ServerOverviewOptions {
  /** Read at most this many collections (default 200); the rest is counted in `skipped`. */
  maxCollections?: number
  /** Collection requests in flight at once (default 6). */
  concurrency?: number
  /** Aborting rejects with an `AbortError`. */
  signal?: AbortSignal
  /** After every collection that was read. */
  onProgress?: (progress: { done: number, total: number }) => void
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
  /** Collections whose information could not be read. */
  failed: string[]
  cluster: ServerCluster | null
  jobs: JobInformation[] | null
  /** The first error of each part that failed; the other parts still hold their data. */
  errors: Partial<Record<'databases' | 'collections' | 'cluster' | 'jobs', unknown>>
}

const REQUEST_TIMEOUT_MS = 15000
const DEFAULT_MAX_COLLECTIONS = 200
const DEFAULT_CONCURRENCY = 6

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * What an admin wants to see first: the databases, the size of every collection, the cluster and the scheduled jobs. The
 * parts are independent — one that fails is reported in `errors` and leaves the others intact. There is no endpoint that
 * lists all collections' numbers at once, so it is **one request per collection** (a few at a time; about 45 ms each on a
 * real server, 8 collections in ~0.1 s), capped at `maxCollections` with progress and abort.
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

    const [databases, names, cluster, jobs] = await Promise.allSettled([getDatabaseInfos(), collectionApi.listCollections(), getCluster(), listJobs()])
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
    if (names.status === 'rejected') {
      errors.collections = names.reason
      return result
    }

    const own = (names.value as string[]).filter(name => !name.startsWith('mc_'))
    result.collectionCount = own.length
    const toRead = own.slice(0, maxCollections)
    result.skipped = own.length - toRead.length

    // the total is known now: a UI can show "0 of N" while the first requests are out
    if (toRead.length > 0) options.onProgress?.({ done: 0, total: toRead.length })
    const settled = await mapLimit(toRead, options.concurrency ?? DEFAULT_CONCURRENCY, async (name) => {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      const init = { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }
      return toCollectionStat(name, await collectionApi.getCollectionInformation({ collectionName: name }, init))
    }, { signal, onProgress: (done, total) => options.onProgress?.({ done, total }) })
    if (signal?.aborted) throw abortError()

    settled.forEach((outcome, index) => {
      if (outcome?.ok) result.collections.push(outcome.value)
      else {
        result.failed.push(toRead[index]!)
        if (outcome && errors.collections === undefined) errors.collections = outcome.error
      }
    })
    return result
  }

  return { loadOverview }
}
