import type { MongocampPaths } from './paths'

// Pure part of `useMongocampNavigation` and `useMongocampBreadcrumbs`: which pages exist, for whom, and where a route sits
// among them. Labels are translation keys here — the composables translate them.

export interface NavigationEntry {
  /** Stable id of the page — also its key in the module's `paths` option. */
  key: keyof MongocampPaths
  labelKey: string
  icon: string
  to: string
  /** Highlight only on the exact route (the home page, whose path is a prefix of every other). */
  exact?: boolean
}

export interface NavigationGroup {
  key: 'main' | 'data' | 'access' | 'server'
  /** No label for the first group. */
  labelKey?: string
  items: NavigationEntry[]
}

const PAGES: Record<Exclude<keyof MongocampPaths, 'buckets'>, { labelKey: string, icon: string }> = {
  home: { labelKey: 'nuxtUiMongocamp.navigation.home', icon: 'i-lucide-house' },
  account: { labelKey: 'nuxtUiMongocamp.navigation.account', icon: 'i-lucide-circle-user' },
  collections: { labelKey: 'nuxtUiMongocamp.navigation.collections', icon: 'i-lucide-database' },
  databases: { labelKey: 'nuxtUiMongocamp.navigation.databases', icon: 'i-lucide-hard-drive' },
  jobs: { labelKey: 'nuxtUiMongocamp.navigation.jobs', icon: 'i-lucide-clock' },
  users: { labelKey: 'nuxtUiMongocamp.navigation.users', icon: 'i-lucide-users' },
  roles: { labelKey: 'nuxtUiMongocamp.navigation.roles', icon: 'i-lucide-shield' },
  permissions: { labelKey: 'nuxtUiMongocamp.navigation.permissions', icon: 'i-lucide-key-round' },
  overview: { labelKey: 'nuxtUiMongocamp.navigation.overview', icon: 'i-lucide-gauge' },
  server: { labelKey: 'nuxtUiMongocamp.navigation.server', icon: 'i-lucide-activity' },
  settings: { labelKey: 'nuxtUiMongocamp.navigation.settings', icon: 'i-lucide-settings' },
}

function entry(key: keyof typeof PAGES, paths: MongocampPaths): NavigationEntry {
  return { key, ...PAGES[key], to: paths[key], ...(key === 'home' ? { exact: true } : {}) }
}

/**
 * The module's pages as navigation groups. Everyone gets Home and Account (no account in server proxy mode — nobody is
 * logged in); the admin pages come in three groups for whoever may see them.
 */
export function buildNavigation(paths: MongocampPaths, who: { canSeeAdmin: boolean, isProxyMode: boolean }): NavigationGroup[] {
  const groups: NavigationGroup[] = [{
    key: 'main',
    items: [entry('home', paths), ...(who.isProxyMode ? [] : [entry('account', paths)])],
  }]
  if (!who.canSeeAdmin) return groups
  groups.push(
    { key: 'data', labelKey: 'nuxtUiMongocamp.navigation.groupData', items: [entry('collections', paths), entry('databases', paths), entry('jobs', paths)] },
    { key: 'access', labelKey: 'nuxtUiMongocamp.navigation.groupAccess', items: [entry('users', paths), entry('roles', paths), entry('permissions', paths)] },
    { key: 'server', labelKey: 'nuxtUiMongocamp.navigation.groupServer', items: [entry('overview', paths), entry('server', paths), entry('settings', paths)] },
  )
  return groups
}

export interface BreadcrumbPart {
  /** A translation key … */
  labelKey?: string
  /** … or a name taken from the URL (a collection, a bucket, a role), shown as it is. */
  text?: string
  /** Absent on the last part: that is the current page. */
  to?: string
  icon?: string
}

// sections whose next path segment is the name of one item
const NAMED = new Set<keyof MongocampPaths>(['collections', 'buckets', 'roles'])
// pages below a collection's name
const TAB_KEYS: Record<string, string> = {
  data: 'nuxtUiMongocamp.navigation.data',
  aggregate: 'nuxtUiMongocamp.navigation.aggregate',
}
const BUCKETS_KEY = 'nuxtUiMongocamp.navigation.buckets'

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return segment
  }
}

const isUnder = (route: string, base: string) => route === base || route.startsWith(base === '/' ? '/' : `${base}/`)

/**
 * Where a route sits among the module's pages: Home › Collections › test_customer › Data. The section is the `paths` entry
 * that is the longest prefix of the route; a route outside every section is just Home. Buckets have no list page of their
 * own, so that part links to the collections list. The last part carries no link.
 */
export function buildBreadcrumbs(routePath: string, paths: MongocampPaths): BreadcrumbPart[] {
  const route = (routePath.split(/[?#]/)[0] ?? '').replace(/\/+$/, '') || '/'
  const parts: BreadcrumbPart[] = [{ labelKey: PAGES.home.labelKey, icon: PAGES.home.icon, to: paths.home }]

  let section: keyof MongocampPaths | undefined
  for (const key of Object.keys(paths) as (keyof MongocampPaths)[]) {
    if (key === 'home' || !isUnder(route, paths[key])) continue
    if (!section || paths[key].length > paths[section].length) section = key
  }

  if (section) {
    const base = paths[section]
    parts.push(section === 'buckets'
      ? { labelKey: BUCKETS_KEY, to: paths.collections }
      : { labelKey: PAGES[section].labelKey, to: base })

    let path = base
    route.slice(base.length).split('/').filter(Boolean).forEach((segment, index) => {
      path += `/${segment}`
      const isName = index === 0 && NAMED.has(section!)
      const tabKey = !isName && section === 'collections' ? TAB_KEYS[segment] : undefined
      parts.push(tabKey ? { labelKey: tabKey, to: path } : { text: decode(segment), to: path })
    })
  }

  delete parts[parts.length - 1]!.to
  return parts
}
