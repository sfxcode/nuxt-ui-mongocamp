// The base routes the components link to — module option `paths`, one place instead of a `*Path` prop per component.

export interface MongocampPaths {
  /** The landing page after login — the first entry of the navigation and of every breadcrumb. */
  home: string
  /** Collection pages: `<collections>/<name>` (info), `<collections>/<name>/data`. */
  collections: string
  /** Bucket file browser: `<buckets>/<bucket>`. */
  buckets: string
  /** The users list. */
  users: string
  /** The roles list; a role's grants are at `<roles>/<role>`. */
  roles: string
  /** The jobs list. */
  jobs: string
  /** The server settings page. */
  settings: string
  /** The signed-in user's account page. */
  account: string
  /** The permission matrix page. */
  permissions: string
  /** The server overview page. */
  overview: string
  /** The databases page. */
  databases: string
  /** The server status page. */
  server: string
}

export const DEFAULT_PATHS: Readonly<MongocampPaths> = Object.freeze({
  home: '/secured',
  collections: '/secured/admin/collections',
  buckets: '/secured/admin/buckets',
  users: '/secured/admin/users',
  roles: '/secured/admin/roles',
  jobs: '/secured/admin/jobs',
  settings: '/secured/admin/settings',
  account: '/secured/account',
  permissions: '/secured/admin/permissions',
  overview: '/secured/admin/overview',
  databases: '/secured/admin/databases',
  server: '/secured/admin/server',
})

/**
 * The configured paths over the defaults. A missing, empty or non-text entry keeps its default, an unknown key is dropped,
 * and trailing slashes are removed (the components append `/<name>` themselves) — `/` alone stays `/`.
 */
export function resolvePaths(configured?: unknown): MongocampPaths {
  const source = (configured && typeof configured === 'object' ? configured : {}) as Record<string, unknown>
  const paths = { ...DEFAULT_PATHS }
  for (const key of Object.keys(DEFAULT_PATHS) as (keyof MongocampPaths)[]) {
    const value = source[key]
    if (typeof value !== 'string' || !value.trim()) continue
    paths[key] = value.trim().replace(/\/+$/, '') || '/'
  }
  return paths
}
