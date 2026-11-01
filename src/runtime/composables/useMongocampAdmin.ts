import { useMongocampClientApi } from '#imports'
import type { Grant, JsonSchema, JsonValueBoolean, Role, UserProfile } from '@sfxcode/nuxt-mongocamp-server'

const REQUEST_TIMEOUT_MS = 15000

// The generated client has no timeout; a hung server would leave the confirm modal spinning forever.
function withTimeout(): RequestInit {
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
}

export default () => {
  const { adminApi, collectionApi } = useMongocampClientApi()

  async function listUsers(filter: string = ''): Promise<UserProfile[]> {
    return adminApi.listUsers({ filter })
  }

  async function addUser(userId: string, password: string, apiKey: string = '', roles: string[] = []): Promise<UserProfile> {
    return adminApi.addUser({
      userInformation: {
        userId,
        password,
        apiKey,
        roles,
      },
    })
  }

  async function deleteUser(userId: string) {
    return adminApi.deleteUser({ userId })
  }

  async function updateUserRoles(userId: string, roles: string[]): Promise<UserProfile> {
    return adminApi.updateRolesForUser({ userId, requestBody: roles })
  }

  async function updateUserPassword(userId: string, password: string) {
    return adminApi.updatePasswordForUser({ userId, passwordUpdateRequest: { password } })
  }

  async function listRoles(filter: string = ''): Promise<Role[]> {
    return adminApi.listRoles({ filter })
  }

  async function listCollections(): Promise<string[]> {
    return collectionApi.listCollections()
  }

  async function addRole(name: string, isAdmin: boolean = false, collectionGrants: Grant[] = []): Promise<Role> {
    return adminApi.addRole({
      role: {
        name,
        isAdmin,
        collectionGrants,
      },
    })
  }

  async function updateRole(roleName: string, isAdmin: boolean, collectionGrants: Grant[] = []): Promise<Role> {
    return adminApi.updateRole({ roleName, updateRoleRequest: { isAdmin, collectionGrants } })
  }

  async function deleteRole(roleName: string) {
    return adminApi.deleteRole({ roleName })
  }

  // Irreversible: removes every document / the collection itself. Callers gate these behind a
  // type-the-name confirmation and `isProtectedCollection`.
  async function clearCollection(collectionName: string) {
    return collectionApi.clearCollection({ collectionName }, withTimeout())
  }

  // After a failed drop: is the collection really still there? A failing lookup counts as "still there",
  // so the original error is never swallowed on a guess.
  async function collectionIsGone(collectionName: string): Promise<boolean> {
    try {
      return !(await collectionApi.listCollections(withTimeout())).includes(collectionName)
    }
    catch {
      return false
    }
  }

  // MongoCamp server 1.6.1 answers every drop with `500 "Boxed Exception"` although the collection is dropped
  // (brain/project/mongocamp-bulk-endpoints-server-behavior.md). Only a 500 is second-guessed — a 403, a
  // timeout or a network error is a real failure — and only by looking at the collection list: gone means done.
  async function deleteCollection(collectionName: string): Promise<JsonValueBoolean> {
    try {
      return await collectionApi.deleteCollection({ collectionName }, withTimeout())
    }
    catch (error) {
      const status = (error as { response?: { status?: number } } | null)?.response?.status
      if (status === 500 && await collectionIsGone(collectionName)) return { value: true }
      throw error
    }
  }

  async function getJsonSchema(collectionName: string): Promise<JsonSchema> {
    return collectionApi.getJsonSchema({ collectionName }, withTimeout())
  }

  async function getUser(userId: string): Promise<UserProfile> {
    return adminApi.getUser({ userId }, withTimeout())
  }

  async function getRole(roleName: string): Promise<Role> {
    return adminApi.getRole({ roleName }, withTimeout())
  }

  // Invalidates the user's current key immediately. The generated client misspells the method
  // (`gnerateNewApiKeyForUser`); that typo stays confined to this wrapper. The new key is returned
  // once, for the caller to show and discard — it is never stored here.
  async function regenerateUserApiKey(userId: string): Promise<string> {
    const result = await adminApi.gnerateNewApiKeyForUser({ userId }, withTimeout())
    return result.value
  }

  return { listUsers, addUser, deleteUser, updateUserRoles, updateUserPassword, listRoles, addRole, updateRole, deleteRole, listCollections, clearCollection, deleteCollection, getJsonSchema, getUser, getRole, regenerateUserApiKey }
}
