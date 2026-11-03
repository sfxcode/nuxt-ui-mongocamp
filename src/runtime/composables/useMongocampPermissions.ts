import { useRuntimeConfig } from '#app'
import { useMongocampStorage } from '#imports'
import { permissionFromGrants } from '../utils/grantMatching'
import type { GrantPermission } from '../utils/grantMatching'

/**
 * What the signed-in user may do with a collection, from the grants in the session profile — so a component can hide an
 * action the server would refuse instead of letting the click fail. **UI-level only**: the server stays the authority.
 *
 * It fails open: an administrator, server proxy mode (the api key's power is the server's decision), a profile without a
 * grant list, and GridFS bucket members all answer "yes". Grants are read from the profile each time, so the answers
 * follow it when the token refresh brings a new one.
 */
export function useMongocampPermissions() {
  const config = useRuntimeConfig()
  const state = useMongocampStorage()
  const isProxyMode: boolean = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false

  function allowed(collectionName: string, permission: GrantPermission): boolean {
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

  return { canRead, canWrite, canAdminister, readableCollections }
}
