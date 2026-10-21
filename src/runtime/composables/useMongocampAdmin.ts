import { useMongocampClientApi } from '#imports'
import type { Grant, JsonSchema, Role, UserProfile } from '@sfxcode/nuxt-mongocamp-server'

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

  async function deleteCollection(collectionName: string) {
    return collectionApi.deleteCollection({ collectionName }, withTimeout())
  }

  async function getJsonSchema(collectionName: string): Promise<JsonSchema> {
    return collectionApi.getJsonSchema({ collectionName }, withTimeout())
  }

  return { listUsers, addUser, deleteUser, updateUserRoles, updateUserPassword, listRoles, addRole, updateRole, deleteRole, listCollections, clearCollection, deleteCollection, getJsonSchema }
}
