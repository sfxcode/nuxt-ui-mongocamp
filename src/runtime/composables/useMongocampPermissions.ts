import { useRuntimeConfig } from '#app'
import { useMongocampClientApi, useMongocampStorage, useState } from '#imports'
import { permissionFromGrants } from '../utils/grantMatching'
import type { GrantPermission } from '../utils/grantMatching'

interface ServerPermissions {
  read: boolean
  write: boolean
  administrate: boolean
}

interface PermissionCache {
  /** whose answers these are — a different user starts empty */
  user: string
  byName: Record<string, ServerPermissions>
}

const REQUEST_TIMEOUT_MS = 15_000

/**
 * What the signed-in user may do with a collection — so a component can hide an action the server would refuse instead of
 * letting the click fail. **UI-level only**: the server stays the authority.
 *
 * `load()` asks the server (`GET /auth/permissions`, server 1.7.0), which resolves roles, grants and the signed-in
 * user's rights itself — and also works in server proxy mode, where there is no profile. `canRead` / `canWrite` /
 * `canAdminister` stay synchronous: they answer from what was loaded, and until then from the grants of the session profile
 * (admin, proxy mode, a profile without a grant list and GridFS bucket members answer "yes" — fail-open). A failing
 * `load()` changes nothing. Administrators are never asked: everything is allowed.
 */
export function useMongocampPermissions() {
  const config = useRuntimeConfig()
  const state = useMongocampStorage()
  const cache = useState<PermissionCache>('mongocamp-permissions', () => ({ user: '', byName: {} }))
  const isProxyMode: boolean = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false

  const currentUser = () => state.value?.profile?.user ?? ''
  const key = (name: string) => name.trim().toLowerCase()

  function fromServer(collectionName: string): ServerPermissions | undefined {
    if (cache.value.user !== currentUser()) return undefined
    return cache.value.byName[key(collectionName)]
  }

  function allowed(collectionName: string, permission: GrantPermission): boolean {
    const answered = fromServer(collectionName)
    if (answered) return answered[permission]
    if (isProxyMode) return true
    const profile = state.value?.profile
    if (!profile || profile.isAdmin) return true
    return permissionFromGrants(profile.grants, collectionName, permission) ?? true
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
      const byName = cache.value.user === user ? { ...cache.value.byName } : {}
      for (const row of rows) byName[key(row.name)] = { read: row.read, write: row.write, administrate: row.administrate }
      cache.value = { user, byName }
    }
    catch {
      // the grants of the profile keep answering
    }
  }

  return { canRead, canWrite, canAdminister, readableCollections, load }
}
