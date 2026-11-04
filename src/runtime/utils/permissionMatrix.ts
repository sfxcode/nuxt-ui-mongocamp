// Who can do what: users × collections, from the roles' grants. Pure. The merge rule is the one verified live on server 1.6.3
// with a throwaway non-admin user (brain/project/mongocamp-server-1-6-3-caveat-recheck.md, plan 17 phase 5): a user's effective
// grants are the UNION of the collection grants of its roles, a grant's `name` matches a collection exactly but ignoring case
// (no wildcards), `read` / `write` / `administrate` are independent, and an admin (`isAdmin` on the user or on any of its roles)
// may do everything. Grants take effect immediately on the server, so the matrix shows what the server enforces now.
import type { Grant, Role, UserProfile } from '@sfxcode/nuxt-mongocamp-server'
import { isBucketMemberCollection } from './collectionProtection'
import { permissionFromGrants } from './grantMatching'
import type { GrantPermission } from './grantMatching'

export const PERMISSIONS: readonly GrantPermission[] = ['read', 'write', 'administrate']

/** What a user may do on one collection. `undefined` = not known (the grants of a GridFS bucket's `.files` / `.chunks` were never verified). */
export interface Cell {
  read: boolean | undefined
  write: boolean | undefined
  administrate: boolean | undefined
  /** An admin user: everything is allowed whatever the grants say. */
  admin: boolean
  /** The roles whose grants allow at least one permission here (empty for an admin and for a user without a grant). */
  via: string[]
}

export interface MatrixUser {
  name: string
  admin: boolean
  roles: string[]
  /** Roles the user has that the role list does not know (deleted meanwhile): their grants cannot count. */
  unknownRoles: string[]
}

export interface PermissionMatrix {
  users: MatrixUser[]
  collections: string[]
  /** `cells[userName][collection]` */
  cells: Record<string, Record<string, Cell>>
}

function grantsOf(role: Role | undefined): Grant[] {
  return Array.isArray(role?.collectionGrants) ? role!.collectionGrants : []
}

/**
 * The matrix for `users` and `collections`. Roles are looked up by name (case-sensitive, as the server keeps them). A user's own
 * `grants` field (what the server lists with the user) counts as well, so a grant that is not in any role still shows.
 */
export function buildPermissionMatrix(users: readonly UserProfile[], roles: readonly Role[], collections: readonly string[]): PermissionMatrix {
  const roleByName = new Map(roles.map(role => [role.name, role]))
  const matrixUsers: MatrixUser[] = []
  const cells: PermissionMatrix['cells'] = {}

  for (const user of users) {
    const roleNames = Array.isArray(user.roles) ? user.roles : []
    const known = roleNames.filter(name => roleByName.has(name))
    const admin = user.isAdmin === true || known.some(name => roleByName.get(name)!.isAdmin === true)
    matrixUsers.push({ name: user.user, admin, roles: roleNames, unknownRoles: roleNames.filter(name => !roleByName.has(name)) })

    const own = Array.isArray(user.grants) ? user.grants : []
    const all = [...known.flatMap(name => grantsOf(roleByName.get(name))), ...own]
    const row: Record<string, Cell> = {}
    for (const collection of collections) {
      if (admin) {
        row[collection] = { read: true, write: true, administrate: true, admin: true, via: [] }
        continue
      }
      const cell: Cell = {
        read: permissionFromGrants(all, collection, 'read'),
        write: permissionFromGrants(all, collection, 'write'),
        administrate: permissionFromGrants(all, collection, 'administrate'),
        admin: false,
        via: known.filter(name => PERMISSIONS.some(p => permissionFromGrants(grantsOf(roleByName.get(name)), collection, p) === true)),
      }
      row[collection] = cell
    }
    cells[user.user] = row
  }
  return { users: matrixUsers, collections: [...collections], cells }
}

/** The letters of a cell, `R W A` with `·` for what is missing; `?` for an unknown one; `admin` for an administrator. */
export function cellLetters(cell: Cell): string {
  if (cell.admin) return 'admin'
  const letter = (value: boolean | undefined, on: string) => (value === undefined ? '?' : value ? on : '·')
  return `${letter(cell.read, 'R')}${letter(cell.write, 'W')}${letter(cell.administrate, 'A')}`
}

/** The short form used in the CSV: `R`, `RW`, `RWA`, `admin`, empty for nothing and `?` for unknown. */
export function cellCode(cell: Cell): string {
  if (cell.admin) return 'admin'
  if (cell.read === undefined && cell.write === undefined && cell.administrate === undefined) return '?'
  return `${cell.read ? 'R' : ''}${cell.write ? 'W' : ''}${cell.administrate ? 'A' : ''}`
}

export function hasAnyPermission(cell: Cell): boolean {
  return cell.admin || PERMISSIONS.some(p => cell[p] === true)
}

export type QuickView = 'all' | 'users-without-roles' | 'collections-nobody-writes' | 'collections-nobody-reads'
export const QUICK_VIEWS: readonly QuickView[] = ['all', 'users-without-roles', 'collections-nobody-writes', 'collections-nobody-reads']

export interface MatrixFilter {
  /** Text matched against user and collection names, ignoring case. */
  text?: string
  /** Only users that have this role. */
  role?: string
  view?: QuickView
}

/** Collections no non-admin user may write (admins always can); bucket members are never listed — their grants are unknown. */
export function collectionsNobodyCan(matrix: PermissionMatrix, permission: GrantPermission): string[] {
  const regular = matrix.users.filter(u => !u.admin)
  return matrix.collections.filter(collection => !isBucketMemberCollection(collection) && regular.every(u => matrix.cells[u.name]![collection]![permission] !== true))
}

export function usersWithoutRoles(matrix: PermissionMatrix): string[] {
  return matrix.users.filter(u => u.roles.length === 0 && !u.admin).map(u => u.name)
}

/** The matrix narrowed to what the filter asks for; the cells are shared, nothing is copied. */
export function filterMatrix(matrix: PermissionMatrix, filter: MatrixFilter): PermissionMatrix {
  const text = (filter.text ?? '').trim().toLowerCase()
  let users = matrix.users
  let collections = matrix.collections
  if (filter.role) users = users.filter(u => u.roles.includes(filter.role!))
  if (filter.view === 'users-without-roles') {
    const names = new Set(usersWithoutRoles(matrix))
    users = users.filter(u => names.has(u.name))
  }
  if (filter.view === 'collections-nobody-writes') collections = collections.filter(c => collectionsNobodyCan(matrix, 'write').includes(c))
  if (filter.view === 'collections-nobody-reads') collections = collections.filter(c => collectionsNobodyCan(matrix, 'read').includes(c))
  if (text) {
    const userHit = users.filter(u => u.name.toLowerCase().includes(text))
    const collectionHit = collections.filter(c => c.toLowerCase().includes(text))
    // a text that names users narrows the users, one that names collections narrows the collections; both stay when it names both
    if (userHit.length > 0 || collectionHit.length === 0) users = userHit
    if (collectionHit.length > 0 || userHit.length === 0) collections = collectionHit
  }
  return { users, collections, cells: matrix.cells }
}

/** Rows for `rowsToCsv`: one per user, `user`, `roles`, then one column per collection with `cellCode`. */
export function matrixToCsvRows(matrix: PermissionMatrix): { keys: string[], rows: Record<string, unknown>[] } {
  const keys = ['user', 'roles', ...matrix.collections]
  const rows = matrix.users.map((user) => {
    const row: Record<string, unknown> = { user: user.name, roles: user.roles.join(' ') }
    for (const collection of matrix.collections) row[collection] = cellCode(matrix.cells[user.name]![collection]!)
    return row
  })
  return { keys, rows }
}
