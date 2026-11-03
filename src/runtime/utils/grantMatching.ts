import { isBucketMemberCollection } from './collectionProtection'

// Which collection grants allow what — the pure part of `useMongocampPermissions`. A grant is
// `{ name, read, write, administrate, grantType }`; what the server does with them was verified on 1.6.3 with a throwaway
// non-admin user (brain/project/mongocamp-server-1-6-3-caveat-recheck.md): the grant `name` is matched against the
// collection name **exactly but case-insensitively** (no wildcards — `prefix*` gave no access to `prefix_a`), and the
// `read` / `write` / `administrate` flags are independent (none implies another here: the server evaluated them as sent).

export type GrantPermission = 'read' | 'write' | 'administrate'

const normalise = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '')

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// `grantType` is `COLLECTION` for a collection grant; an absent one is read as such (the module writes it that way)
function isCollectionGrant(grant: Record<string, unknown>): boolean {
  const type = normalise(grant.grantType)
  return type === '' || type === 'collection'
}

/**
 * Whether the grants allow `permission` on `collection`: `true` / `false` when they decide, `undefined` when they cannot
 * — no grant list at all, or a GridFS bucket member (`<bucket>.files` / `.chunks`), whose grant name and type were not
 * verified. Callers show the action on `undefined` and let the server refuse (it answers a missing grant clearly).
 * Several grants for the same name add up: any one that allows it is enough.
 */
export function permissionFromGrants(grants: unknown, collection: string, permission: GrantPermission): boolean | undefined {
  if (!Array.isArray(grants)) return undefined
  if (isBucketMemberCollection(collection)) return undefined
  const wanted = normalise(collection)
  return grants.some(grant => isObject(grant) && isCollectionGrant(grant) && normalise(grant.name) === wanted && grant[permission] === true)
}
