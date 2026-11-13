import { useMongocampClientApi, useMongocampStorage, useState } from '#imports'
import { computed } from 'vue'
import { groupCollectionNames } from '../utils/collectionNames'

const REQUEST_TIMEOUT_MS = 15_000

export type CollectionNamesStatus = 'idle' | 'loading' | 'ready' | 'failed'

interface NamesCache {
  // whose list this is — another user (or a logout) must never see it
  user: string
  status: CollectionNamesStatus
  names: string[]
}

// the request in flight, shared by every caller so a sidebar and a palette mounting together make one request
let inFlight: { user: string, run: Promise<void> } | undefined

/**
 * The collection names of the server, **loaded once and shared** by everything that shows them (a sidebar, a panel, a
 * switcher) — a `useState` cache per signed-in user, instead of one `listCollections` request per component. `load()` asks
 * only when nothing is loaded yet, `refresh()` always; neither throws (`status` becomes `failed`, the last list stays).
 * `collections` / `buckets` / `system` are the same list split the usual way (`utils/collectionNames.ts`).
 *
 * `MongocampCollections` writes every list it loads into this cache (`set`), so after a create / drop / rename / copy done
 * there the shared list is current without another request. Code that changes collections elsewhere calls `refresh()`.
 */
export function useMongocampCollectionNames() {
  const { collectionApi } = useMongocampClientApi()
  const storage = useMongocampStorage()
  const cache = useState<NamesCache>('mongocamp-collection-names', () => ({ user: '', status: 'idle', names: [] }))

  const currentUser = () => storage.value?.profile?.user ?? ''
  const own = () => cache.value.user === currentUser()

  const names = computed<string[]>(() => (own() ? cache.value.names : []))
  const status = computed<CollectionNamesStatus>(() => (own() ? cache.value.status : 'idle'))
  const groups = computed(() => groupCollectionNames(names.value))
  const collections = computed(() => groups.value.collections)
  const buckets = computed(() => groups.value.buckets)
  const system = computed(() => groups.value.system)

  async function load(force = false): Promise<void> {
    const user = currentUser()
    if (inFlight?.user === user) return inFlight.run
    if (!force && own() && cache.value.status === 'ready') return
    const previous = own() ? cache.value.names : []
    cache.value = { user, status: 'loading', names: previous }
    // registered before the request starts, so the `finally` below always finds (and clears) it
    const flight = { user, run: Promise.resolve() }
    inFlight = flight
    flight.run = (async () => {
      try {
        const loaded = await collectionApi.listCollections({ signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
        // the user changed while the request ran: its answer belongs to nobody
        if (currentUser() === user) cache.value = { user, status: 'ready', names: [...loaded] }
      }
      catch {
        if (currentUser() === user) cache.value = { user, status: 'failed', names: previous }
      }
      finally {
        if (inFlight === flight) inFlight = undefined
      }
    })()
    return flight.run
  }

  /** Asks the server again, whatever is cached. */
  const refresh = () => load(true)

  /** Puts a list that was just loaded elsewhere into the cache — no request. */
  function set(loaded: readonly string[]) {
    cache.value = { user: currentUser(), status: 'ready', names: [...loaded] }
  }

  /** Forgets the list, so the next `load()` asks again. */
  function invalidate() {
    cache.value = { user: currentUser(), status: 'idle', names: [] }
  }

  return { names, collections, buckets, system, status, load, refresh, set, invalidate }
}
