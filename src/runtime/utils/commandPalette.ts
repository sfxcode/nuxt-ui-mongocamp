import { isBucketMemberCollection } from './collectionProtection'

export type PaletteKind = 'collection' | 'bucket' | 'user' | 'role' | 'job' | 'action'

export interface PaletteEntry {
  /** Unique, e.g. `collection:orders` */
  id: string
  kind: PaletteKind
  label: string
  description?: string
  icon: string
  /** Route to open; absent for actions without a page */
  to?: string
  /** Set for actions that are not navigation (`refresh`, `logout`) */
  action?: 'refresh' | 'logout'
}

export interface PalettePaths {
  /** `<collectionPath>/<name>/data` */
  collectionPath: string
  /** `<bucketPath>/<bucket>` */
  bucketPath: string
  usersPath: string
  /** `<rolePath>/<name>` (the grants page) */
  rolePath: string
  jobsPath: string
  settingsPath: string
  accountPath: string
}

export interface PaletteData {
  collections?: string[]
  users?: string[]
  roles?: string[]
  jobs?: { name: string, group: string }[]
}

const join = (base: string, ...parts: string[]) => [base.replace(/\/+$/, ''), ...parts.map(encodeURIComponent)].join('/')

/** A cache entry is reusable while younger than the TTL; a clock that went backwards counts as stale. */
export function isFresh(loadedAt: number | undefined, now: number, ttlMs: number): boolean {
  return loadedAt !== undefined && now >= loadedAt && now - loadedAt < ttlMs
}

/**
 * Everything the palette can jump to. `canRead` hides collections the user may not read (UI-level, fail-open);
 * `mc_*` collections and GridFS halves never appear as collections — a `<name>.files` becomes a bucket entry.
 */
export function buildEntries(data: PaletteData, paths: PalettePaths, options: { canRead?: (collection: string) => boolean } = {}): PaletteEntry[] {
  const canRead = options.canRead ?? (() => true)
  const entries: PaletteEntry[] = []

  for (const name of data.collections ?? []) {
    if (name.startsWith('mc_')) continue
    if (name.endsWith('.files')) {
      if (!canRead(name)) continue
      const bucket = name.slice(0, -'.files'.length)
      entries.push({ id: `bucket:${bucket}`, kind: 'bucket', label: bucket, icon: 'i-lucide-folder-archive', to: join(paths.bucketPath, bucket) })
      continue
    }
    if (isBucketMemberCollection(name) || !canRead(name)) continue
    entries.push({ id: `collection:${name}`, kind: 'collection', label: name, icon: 'i-lucide-database', to: join(paths.collectionPath, name, 'data') })
  }
  for (const user of data.users ?? []) {
    entries.push({ id: `user:${user}`, kind: 'user', label: user, icon: 'i-lucide-user', to: paths.usersPath })
  }
  for (const role of data.roles ?? []) {
    entries.push({ id: `role:${role}`, kind: 'role', label: role, icon: 'i-lucide-shield', to: join(paths.rolePath, role) })
  }
  for (const job of data.jobs ?? []) {
    entries.push({ id: `job:${job.group}/${job.name}`, kind: 'job', label: job.name, description: job.group, icon: 'i-lucide-clock', to: paths.jobsPath })
  }
  return entries
}

/** The fixed actions; settings is for administrators only. */
export function buildActions(paths: PalettePaths, options: { isAdmin: boolean, canLogout?: boolean }): PaletteEntry[] {
  const actions: PaletteEntry[] = [
    { id: 'action:account', kind: 'action', label: 'account', icon: 'i-lucide-user-cog', to: paths.accountPath },
  ]
  if (options.isAdmin) actions.push({ id: 'action:settings', kind: 'action', label: 'settings', icon: 'i-lucide-settings', to: paths.settingsPath })
  actions.push({ id: 'action:refresh', kind: 'action', label: 'refresh', icon: 'i-lucide-refresh-cw', action: 'refresh' })
  if (options.canLogout ?? true) actions.push({ id: 'action:logout', kind: 'action', label: 'logout', icon: 'i-lucide-log-out', action: 'logout' })
  return actions
}
