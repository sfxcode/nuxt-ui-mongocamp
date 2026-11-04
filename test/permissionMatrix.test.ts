import { describe, expect, it } from 'vitest'
import type { Grant, Role, UserProfile } from '@sfxcode/nuxt-mongocamp-server'
import { buildPermissionMatrix, cellCode, cellLetters, collectionsNobodyCan, filterMatrix, hasAnyPermission, matrixToCsvRows, usersWithoutRoles } from '../src/runtime/utils/permissionMatrix'

const grant = (name: string, read: boolean, write = false, administrate = false, grantType = 'COLLECTION'): Grant => ({ name, read, write, administrate, grantType })
const role = (name: string, grants: Grant[], isAdmin = false): Role => ({ name, isAdmin, collectionGrants: grants })
const user = (name: string, roles: string[], extra: Partial<UserProfile> = {}): UserProfile => ({ user: name, isAdmin: false, roles, ...extra })

const roles = [
  role('reader', [grant('orders', true), grant('Users', true)]),
  role('writer', [grant('orders', false, true), grant('logs', true, true, true)]),
  role('boss', [], true),
]
const users = [
  user('ann', ['reader']),
  user('bob', ['reader', 'writer']),
  user('cy', []),
  user('dee', ['boss']),
  user('eve', ['ghost']),
]
const collections = ['orders', 'users', 'logs', 'secret', 'photos.files']
const matrix = buildPermissionMatrix(users, roles, collections)
const cell = (u: string, c: string) => matrix.cells[u]![c]!

describe('buildPermissionMatrix — the merge rule verified on the server', () => {
  it('a user gets what its role grants, and nothing else', () => {
    expect(cell('ann', 'orders')).toMatchObject({ read: true, write: false, administrate: false, admin: false, via: ['reader'] })
    expect(cell('ann', 'logs')).toMatchObject({ read: false, write: false, administrate: false, via: [] })
    expect(cell('ann', 'secret')).toMatchObject({ read: false, write: false, administrate: false })
  })

  it('adds up the grants of several roles; the flags are independent', () => {
    expect(cell('bob', 'orders')).toMatchObject({ read: true, write: true, administrate: false, via: ['reader', 'writer'] })
    expect(cell('bob', 'logs')).toMatchObject({ read: true, write: true, administrate: true, via: ['writer'] })
  })

  it('matches the grant name ignoring case, exactly otherwise (no wildcards)', () => {
    expect(cell('ann', 'users').read).toBe(true) // grant "Users", collection "users"
    const wild = buildPermissionMatrix([user('w', ['wild'])], [role('wild', [grant('ord*', true)])], ['orders'])
    expect(wild.cells.w!.orders!.read).toBe(false)
  })

  it('an admin (on the user or on a role) may do everything, whatever the grants say', () => {
    expect(cell('dee', 'secret')).toEqual({ read: true, write: true, administrate: true, admin: true, via: [] })
    const direct = buildPermissionMatrix([user('a', [], { isAdmin: true })], [], ['x'])
    expect(direct.cells.a!.x!.admin).toBe(true)
    expect(matrix.users.find(u => u.name === 'dee')!.admin).toBe(true)
  })

  it('ignores a role the role list does not know and names it', () => {
    expect(cell('eve', 'orders')).toMatchObject({ read: false, write: false, administrate: false, via: [] })
    expect(matrix.users.find(u => u.name === 'eve')!.unknownRoles).toEqual(['ghost'])
  })

  it('counts a grant listed with the user itself, not only those of its roles', () => {
    const m = buildPermissionMatrix([user('own', [], { grants: [grant('secret', true)] })], roles, ['secret'])
    expect(m.cells.own!.secret).toMatchObject({ read: true, via: [] })
  })

  it('only collection grants count', () => {
    const m = buildPermissionMatrix([user('t', ['r'])], [role('r', [grant('orders', true, true, true, 'BUCKET')])], ['orders'])
    expect(m.cells.t!.orders!.read).toBe(false)
    const absent = buildPermissionMatrix([user('t', ['r'])], [role('r', [{ name: 'orders', read: true, write: false, administrate: false } as Grant])], ['orders'])
    expect(absent.cells.t!.orders!.read).toBe(true) // an absent grantType is read as COLLECTION
  })

  it('does not know the permissions on a GridFS bucket member for a non-admin', () => {
    expect(cell('ann', 'photos.files')).toMatchObject({ read: undefined, write: undefined, administrate: undefined })
    expect(cell('dee', 'photos.files').admin).toBe(true)
  })

  it('copes with a role without grants and a user without roles', () => {
    expect(cell('cy', 'orders')).toMatchObject({ read: false, via: [] })
    const bare = buildPermissionMatrix([{ user: 'x', isAdmin: false } as UserProfile], [{ name: 'r', isAdmin: false } as Role], ['a'])
    expect(bare.cells.x!.a!.read).toBe(false)
  })
})

describe('cell text', () => {
  it('shows R W A with dots for what is missing and ? for unknown', () => {
    expect(cellLetters(cell('bob', 'orders'))).toBe('RW·')
    expect(cellLetters(cell('bob', 'logs'))).toBe('RWA')
    expect(cellLetters(cell('ann', 'secret'))).toBe('···')
    expect(cellLetters(cell('ann', 'photos.files'))).toBe('???')
    expect(cellLetters(cell('dee', 'orders'))).toBe('admin')
  })

  it('has a short code for the CSV', () => {
    expect([cell('ann', 'orders'), cell('bob', 'logs'), cell('ann', 'secret'), cell('ann', 'photos.files'), cell('dee', 'orders')].map(cellCode)).toEqual(['R', 'RWA', '', '?', 'admin'])
    expect(hasAnyPermission(cell('ann', 'secret'))).toBe(false)
    expect(hasAnyPermission(cell('ann', 'orders'))).toBe(true)
    expect(hasAnyPermission(cell('dee', 'secret'))).toBe(true)
  })
})

describe('quick views', () => {
  it('finds users without any role (an admin without roles is not one)', () => {
    expect(usersWithoutRoles(matrix)).toEqual(['cy'])
    expect(usersWithoutRoles(buildPermissionMatrix([user('a', [], { isAdmin: true })], [], []))).toEqual([])
  })

  it('finds collections nobody but an admin can write or read, never bucket members', () => {
    expect(collectionsNobodyCan(matrix, 'write')).toEqual(['users', 'secret'])
    expect(collectionsNobodyCan(matrix, 'read')).toEqual(['secret'])
  })
})

describe('filterMatrix', () => {
  it('narrows by role', () => {
    expect(filterMatrix(matrix, { role: 'writer' }).users.map(u => u.name)).toEqual(['bob'])
    expect(filterMatrix(matrix, { role: 'writer' }).collections).toEqual(collections)
  })

  it('applies the quick views', () => {
    expect(filterMatrix(matrix, { view: 'users-without-roles' }).users.map(u => u.name)).toEqual(['cy'])
    expect(filterMatrix(matrix, { view: 'collections-nobody-writes' }).collections).toEqual(['users', 'secret'])
    expect(filterMatrix(matrix, { view: 'collections-nobody-reads' }).collections).toEqual(['secret'])
    expect(filterMatrix(matrix, { view: 'all' })).toEqual(matrix)
  })

  it('a text that names users narrows the users, one that names collections the collections', () => {
    expect(filterMatrix(matrix, { text: 'BO' }).users.map(u => u.name)).toEqual(['bob'])
    expect(filterMatrix(matrix, { text: 'BO' }).collections).toEqual(collections)
    expect(filterMatrix(matrix, { text: 'ord' }).collections).toEqual(['orders'])
    expect(filterMatrix(matrix, { text: 'ord' }).users).toHaveLength(5)
  })

  it('a text that names nothing leaves nothing, and a blank one everything', () => {
    const none = filterMatrix(matrix, { text: 'zzz' })
    expect(none.users).toEqual([])
    expect(none.collections).toEqual([])
    expect(filterMatrix(matrix, { text: '   ' })).toEqual(matrix)
  })

  it('shares the cells and never changes the matrix', () => {
    const before = JSON.stringify(matrix)
    expect(filterMatrix(matrix, { role: 'reader' }).cells).toBe(matrix.cells)
    expect(JSON.stringify(matrix)).toBe(before)
  })
})

describe('matrixToCsvRows', () => {
  it('has a row per user with the roles and one code per collection', () => {
    const { keys, rows } = matrixToCsvRows(filterMatrix(matrix, { role: 'writer' }))
    expect(keys).toEqual(['user', 'roles', ...collections])
    expect(rows).toEqual([{ 'user': 'bob', 'roles': 'reader writer', 'orders': 'RW', 'users': 'R', 'logs': 'RWA', 'secret': '', 'photos.files': '?' }])
  })
})
