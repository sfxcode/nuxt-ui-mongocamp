import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs, buildNavigation } from '../src/runtime/utils/navigation'
import { DEFAULT_PATHS, resolvePaths } from '../src/runtime/utils/paths'

const K = (key: string) => `nuxtUiMongocamp.navigation.${key}`

describe('buildNavigation', () => {
  it('gives everyone Home and Account only', () => {
    const groups = buildNavigation(DEFAULT_PATHS, { canSeeAdmin: false, isProxyMode: false })

    expect(groups).toHaveLength(1)
    expect(groups[0]!.labelKey).toBeUndefined()
    expect(groups[0]!.items.map(i => [i.key, i.to])).toEqual([['home', '/secured'], ['account', '/secured/account']])
    expect(groups[0]!.items[0]!.exact).toBe(true)
    expect(groups[0]!.items[1]!.exact).toBeUndefined()
  })

  it('adds the admin pages in three labelled groups', () => {
    const groups = buildNavigation(DEFAULT_PATHS, { canSeeAdmin: true, isProxyMode: false })

    expect(groups.map(g => [g.key, g.labelKey])).toEqual([['main', undefined], ['data', K('groupData')], ['access', K('groupAccess')], ['server', K('groupServer')]])
    expect(groups.slice(1).map(g => g.items.map(i => i.key))).toEqual([
      ['collections', 'databases', 'jobs'],
      ['users', 'roles', 'permissions'],
      ['overview', 'server', 'settings'],
    ])
    expect(groups.flatMap(g => g.items).every(i => i.icon.startsWith('i-lucide-') && i.labelKey === K(i.key))).toBe(true)
  })

  it('has no Account in server proxy mode', () => {
    const groups = buildNavigation(DEFAULT_PATHS, { canSeeAdmin: true, isProxyMode: true })

    expect(groups[0]!.items.map(i => i.key)).toEqual(['home'])
    expect(groups).toHaveLength(4)
  })

  it('links to the configured paths', () => {
    const paths = resolvePaths({ home: '/', users: '/people', collections: '/db' })
    const items = buildNavigation(paths, { canSeeAdmin: true, isProxyMode: false }).flatMap(g => g.items)

    expect(items.find(i => i.key === 'home')!.to).toBe('/')
    expect(items.find(i => i.key === 'users')!.to).toBe('/people')
    expect(items.find(i => i.key === 'collections')!.to).toBe('/db')
    expect(items.find(i => i.key === 'roles')!.to).toBe('/secured/admin/roles')
  })
})

describe('buildBreadcrumbs', () => {
  const crumbs = (route: string, paths = DEFAULT_PATHS) => buildBreadcrumbs(route, paths).map(p => [p.labelKey ?? p.text, p.to])

  it('is just Home, without a link, on the home page', () => {
    expect(buildBreadcrumbs('/secured', DEFAULT_PATHS)).toEqual([{ labelKey: K('home'), icon: 'i-lucide-house' }])
  })

  it('names a list page and leaves the last part without a link', () => {
    expect(crumbs('/secured/admin/users')).toEqual([[K('home'), '/secured'], [K('users'), undefined]])
    expect(crumbs('/secured/account')).toEqual([[K('home'), '/secured'], [K('account'), undefined]])
  })

  it('walks into a collection and its tabs', () => {
    expect(crumbs('/secured/admin/collections/test_customer')).toEqual([
      [K('home'), '/secured'],
      [K('collections'), '/secured/admin/collections'],
      ['test_customer', undefined],
    ])
    expect(crumbs('/secured/admin/collections/test_customer/data')).toEqual([
      [K('home'), '/secured'],
      [K('collections'), '/secured/admin/collections'],
      ['test_customer', '/secured/admin/collections/test_customer'],
      [K('data'), undefined],
    ])
    expect(crumbs('/secured/admin/collections/test_customer/aggregate').at(-1)).toEqual([K('aggregate'), undefined])
  })

  it('shows a collection that is called "data" by its name, not as the tab', () => {
    expect(crumbs('/secured/admin/collections/data/data').slice(2)).toEqual([['data', '/secured/admin/collections/data'], [K('data'), undefined]])
  })

  it('decodes names from the URL and survives a broken escape', () => {
    expect(crumbs('/secured/admin/collections/my%20data').at(-1)).toEqual(['my data', undefined])
    expect(crumbs('/secured/admin/collections/100%').at(-1)).toEqual(['100%', undefined])
  })

  it('links the bucket section to the collections list — buckets have no list page', () => {
    expect(crumbs('/secured/admin/buckets/images')).toEqual([
      [K('home'), '/secured'],
      [K('buckets'), '/secured/admin/collections'],
      ['images', undefined],
    ])
  })

  it('names a role', () => {
    expect(crumbs('/secured/admin/roles/support')).toEqual([[K('home'), '/secured'], [K('roles'), '/secured/admin/roles'], ['support', undefined]])
  })

  it('ignores a trailing slash, a query and a hash', () => {
    expect(crumbs('/secured/admin/jobs/?page=2#top')).toEqual([[K('home'), '/secured'], [K('jobs'), undefined]])
  })

  it('is just Home (linked) for a route outside every configured page', () => {
    expect(crumbs('/secured/manager')).toEqual([[K('home'), undefined]])
    expect(crumbs('/somewhere/else')).toEqual([[K('home'), undefined]])
  })

  it('does not take a look-alike prefix for a section', () => {
    expect(crumbs('/secured/admin/usersettings')).toEqual([[K('home'), undefined]])
  })

  it('follows configured paths and picks the longest matching one', () => {
    const paths = resolvePaths({ home: '/', collections: '/db', buckets: '/db/buckets', server: '/db/server' })

    expect(crumbs('/db/orders/data', paths)).toEqual([[K('home'), '/'], [K('collections'), '/db'], ['orders', '/db/orders'], [K('data'), undefined]])
    expect(crumbs('/db/buckets/images', paths)).toEqual([[K('home'), '/'], [K('buckets'), '/db'], ['images', undefined]])
    expect(crumbs('/db/server', paths)).toEqual([[K('home'), '/'], [K('server'), undefined]])
    expect(crumbs('/', paths)).toEqual([[K('home'), undefined]])
  })
})
