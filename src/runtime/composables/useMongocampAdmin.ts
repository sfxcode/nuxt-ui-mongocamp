import { useMongocampApi } from '#imports'
import type { Grant, Role, UserProfile } from '@sfxcode/nuxt-mongocamp-server'

export default () => {
  const { adminApi, collectionApi } = useMongocampApi()

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

  return { listUsers, addUser, deleteUser, updateUserRoles, updateUserPassword, listRoles, addRole, updateRole, deleteRole, listCollections }
}
