import { useMongocampClientApi, useMongocampStorage, useState } from '#imports'
import { isBucketMemberCollection } from '../utils/collectionProtection'
import type { GrantPermission } from '../utils/grantMatching'
import { useMongocampProxyMode } from './useMongocampProxyMode'

interface ServerPermissions {
  read: boolean
  write: boolean
  administrate: boolean
}

interface PermissionCache {
  /** whose answers these are — a different user starts empty */
  user: string
  byName: Record<string, ServerPermissions>
  /** a full `load()` (no collection) succeeded: a collection missing from `byName` has no grant */
  complete: boolean
}

const REQUEST_TIMEOUT_MS = 15_000

/**
 * What the signed-in user may do with a collection — so a component can hide an action the server would refuse instead of
 * letting the click fail. **UI-level only**: the server stays the authority.
 *
 * `load()` asks the server (`GET /auth/permissions`, server 1.7.0), which resolves roles, grants and the signed-in
 * user's rights itself — and also works in server proxy mode, where there is no profile. `canRead` / `canWrite` /
 * `canAdminister` stay synchronous: they answer from what was loaded. After a full `load()` (no argument) a collection the
 * server did not list has no grant ("no"); before any answer, or when it failed, they answer "yes" (fail-open — the server
 * refuses). Admin, proxy mode, no profile and GridFS bucket members are "yes" too. **Grants are never read from the
 * session** — neither from the token (server 1.9: only `user`/`isAdmin` are in it) nor from the stored profile, which the
 * session cookie must not carry (4 KB cookie limit). Administrators are never asked: everything is allowed.
 */
export function useMongocampPermissions() {
  const state = useMongocampStorage()
  const cache = useState<PermissionCache>('mongocamp-permissions', () => ({ user: '', byName: {}, complete: false }))
  const isProxyMode = useMongocampProxyMode()

  const currentUser = () => state.value?.profile?.user ?? ''
  const key = (name: string) => name.trim().toLowerCase()

  const ownCache = () => cache.value.user === currentUser()

  function allowed(collectionName: string, permission: GrantPermission): boolean {
    const answered = ownCache() ? cache.value.byName[key(collectionName)] : undefined
    if (answered) return answered[permission]
    if (isProxyMode) return true
    const profile = state.value?.profile
    if (!profile || profile.isAdmin) return true
    // bucket member grants (`<bucket>.files` / `.chunks`) were never verified — let the server decide
    if (isBucketMemberCollection(collectionName)) return true
    return !(ownCache() && cache.value.complete)
  }

  const canRead = (collectionName: string): boolean => allowed(collectionName, 'read')
  const canWrite = (collectionName: string): boolean => allowed(collectionName, 'write')
  const canAdminister = (collectionName: string): boolean => allowed(collectionName, 'administrate')

  /** The collections of a list the user may read, in the same order. */
  function readableCollections(collectionNames: string[]): string[] {
    return collectionNames.filter(canRead)
  }

  /**
   * Asks the server what the user may do — for one collection, or (no argument) for every collection that has a grant —
   * and keeps the answer for the synchronous checks above. Never throws.
   */
  async function load(collectionName?: string): Promise<void> {
    if (state.value?.profile?.isAdmin) return
    try {
      const { authApi } = useMongocampClientApi()
      const rows = await authApi.userPermissions(collectionName ? { collection: collectionName } : {}, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      const user = currentUser()
      const same = cache.value.user === user
      const byName = same ? { ...cache.value.byName } : {}
      for (const row of rows) byName[key(row.name)] = { read: row.read, write: row.write, administrate: row.administrate }
      cache.value = { user, byName, complete: !collectionName || (same && cache.value.complete) }
    }
    catch {
      // earlier answers (or fail-open) keep answering
    }
  }

  return { canRead, canWrite, canAdminister, readableCollections, load }
}
