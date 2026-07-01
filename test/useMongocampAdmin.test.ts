import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAdminApi = {
  listUsers: vi.fn(),
  addUser: vi.fn(),
  deleteUser: vi.fn(),
  updateRolesForUser: vi.fn(),
  updatePasswordForUser: vi.fn(),
  listRoles: vi.fn(),
  addRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}

const mockCollectionApi = {
  listCollections: vi.fn(),
}

vi.mock('#imports', () => ({
  useMongocampApi: () => ({ adminApi: mockAdminApi, collectionApi: mockCollectionApi }),
}))

const { default: useMongocampAdmin } = await import('../src/runtime/composables/useMongocampAdmin')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listUsers', () => {
  it('passes the filter through', async () => {
    mockAdminApi.listUsers.mockResolvedValueOnce([{ user: 'alice' }])

    const { listUsers } = useMongocampAdmin()
    const result = await listUsers('ali')

    expect(mockAdminApi.listUsers).toHaveBeenCalledWith({ filter: 'ali' })
    expect(result).toEqual([{ user: 'alice' }])
  })

  it('defaults filter to an empty string', async () => {
    mockAdminApi.listUsers.mockResolvedValueOnce([])

    const { listUsers } = useMongocampAdmin()
    await listUsers()

    expect(mockAdminApi.listUsers).toHaveBeenCalledWith({ filter: '' })
  })
})

describe('addUser', () => {
  it('nests fields under userInformation', async () => {
    mockAdminApi.addUser.mockResolvedValueOnce({ user: 'alice' })

    const { addUser } = useMongocampAdmin()
    await addUser('alice', 'secret', 'key-123', ['admin'])

    expect(mockAdminApi.addUser).toHaveBeenCalledWith({
      userInformation: { userId: 'alice', password: 'secret', apiKey: 'key-123', roles: ['admin'] },
    })
  })

  it('defaults apiKey and roles', async () => {
    mockAdminApi.addUser.mockResolvedValueOnce({ user: 'alice' })

    const { addUser } = useMongocampAdmin()
    await addUser('alice', 'secret')

    expect(mockAdminApi.addUser).toHaveBeenCalledWith({
      userInformation: { userId: 'alice', password: 'secret', apiKey: '', roles: [] },
    })
  })
})

describe('deleteUser', () => {
  it('passes userId through', async () => {
    const { deleteUser } = useMongocampAdmin()
    await deleteUser('alice')

    expect(mockAdminApi.deleteUser).toHaveBeenCalledWith({ userId: 'alice' })
  })
})

describe('updateUserRoles', () => {
  it('sends roles as requestBody', async () => {
    mockAdminApi.updateRolesForUser.mockResolvedValueOnce({ user: 'alice' })

    const { updateUserRoles } = useMongocampAdmin()
    await updateUserRoles('alice', ['admin', 'editor'])

    expect(mockAdminApi.updateRolesForUser).toHaveBeenCalledWith({ userId: 'alice', requestBody: ['admin', 'editor'] })
  })
})

describe('updateUserPassword', () => {
  it('nests password under passwordUpdateRequest', async () => {
    const { updateUserPassword } = useMongocampAdmin()
    await updateUserPassword('alice', 'new-secret')

    expect(mockAdminApi.updatePasswordForUser).toHaveBeenCalledWith({
      userId: 'alice',
      passwordUpdateRequest: { password: 'new-secret' },
    })
  })
})

describe('listRoles', () => {
  it('passes the filter through', async () => {
    mockAdminApi.listRoles.mockResolvedValueOnce([{ name: 'admin' }])

    const { listRoles } = useMongocampAdmin()
    const result = await listRoles('adm')

    expect(mockAdminApi.listRoles).toHaveBeenCalledWith({ filter: 'adm' })
    expect(result).toEqual([{ name: 'admin' }])
  })

  it('defaults filter to an empty string', async () => {
    mockAdminApi.listRoles.mockResolvedValueOnce([])

    const { listRoles } = useMongocampAdmin()
    await listRoles()

    expect(mockAdminApi.listRoles).toHaveBeenCalledWith({ filter: '' })
  })
})

describe('listCollections', () => {
  it('delegates to collectionApi.listCollections with no arguments', async () => {
    mockCollectionApi.listCollections.mockResolvedValueOnce(['users', 'orders'])

    const { listCollections } = useMongocampAdmin()
    const result = await listCollections()

    expect(mockCollectionApi.listCollections).toHaveBeenCalledWith()
    expect(result).toEqual(['users', 'orders'])
  })
})

describe('addRole', () => {
  it('nests fields under role', async () => {
    mockAdminApi.addRole.mockResolvedValueOnce({ name: 'editor' })

    const { addRole } = useMongocampAdmin()
    await addRole('editor', true, [{ name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }])

    expect(mockAdminApi.addRole).toHaveBeenCalledWith({
      role: {
        name: 'editor',
        isAdmin: true,
        collectionGrants: [{ name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }],
      },
    })
  })

  it('defaults isAdmin to false and collectionGrants to an empty array', async () => {
    mockAdminApi.addRole.mockResolvedValueOnce({ name: 'editor' })

    const { addRole } = useMongocampAdmin()
    await addRole('editor')

    expect(mockAdminApi.addRole).toHaveBeenCalledWith({
      role: { name: 'editor', isAdmin: false, collectionGrants: [] },
    })
  })
})

describe('updateRole', () => {
  it('nests fields under updateRoleRequest', async () => {
    mockAdminApi.updateRole.mockResolvedValueOnce({ name: 'editor' })

    const { updateRole } = useMongocampAdmin()
    await updateRole('editor', true, [{ name: 'users', read: true, write: true, administrate: false, grantType: 'COLLECTION' }])

    expect(mockAdminApi.updateRole).toHaveBeenCalledWith({
      roleName: 'editor',
      updateRoleRequest: {
        isAdmin: true,
        collectionGrants: [{ name: 'users', read: true, write: true, administrate: false, grantType: 'COLLECTION' }],
      },
    })
  })

  it('defaults collectionGrants to an empty array', async () => {
    mockAdminApi.updateRole.mockResolvedValueOnce({ name: 'editor' })

    const { updateRole } = useMongocampAdmin()
    await updateRole('editor', false)

    expect(mockAdminApi.updateRole).toHaveBeenCalledWith({
      roleName: 'editor',
      updateRoleRequest: { isAdmin: false, collectionGrants: [] },
    })
  })
})

describe('deleteRole', () => {
  it('passes roleName through', async () => {
    const { deleteRole } = useMongocampAdmin()
    await deleteRole('editor')

    expect(mockAdminApi.deleteRole).toHaveBeenCalledWith({ roleName: 'editor' })
  })
})
