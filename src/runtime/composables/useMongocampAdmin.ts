import { useMongocampApi } from '#imports'
import type { Grant, Role, UserProfile } from '@sfxcode/nuxt-mongocamp-server'

export default () => {
  const { adminApi } = useMongocampApi()

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

  async function addRole(name: string, isAdmin: boolean = false, collectionGrants: Grant[] = []): Promise<Role> {
    return adminApi.addRole({
      role: {
        name,
        isAdmin,
        collectionGrants,
      },
    })
  }

  async function deleteRole(roleName: string) {
    return adminApi.deleteRole({ roleName })
  }

  return { addUser, deleteUser, addRole, deleteRole }
}
