import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import MongocampPermissionMatrix from '../../src/runtime/components/MongocampPermissionMatrix.vue'

enableAutoUnmount(afterEach)

const mockListUsers = vi.fn()
const mockListRoles = vi.fn()
const mockListCollections = vi.fn()
const mockDownload = vi.hoisted(() => vi.fn())

vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({ listUsers: mockListUsers, listRoles: mockListRoles, listCollections: mockListCollections }),
}))
vi.mock('../../src/runtime/utils/exportRows', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/runtime/utils/exportRows')>(),
  downloadTextFile: mockDownload,
}))

const grant = (name: string, read: boolean, write = false, administrate = false) => ({ name, read, write, administrate, grantType: 'COLLECTION' })

beforeEach(() => {
  vi.resetAllMocks()
  mockListUsers.mockResolvedValue([
    { user: 'ann', isAdmin: false, roles: ['reader'] },
    { user: 'bob', isAdmin: false, roles: ['reader', 'writer'] },
    { user: 'cy', isAdmin: false, roles: [] },
    { user: 'dee', isAdmin: true, roles: ['boss'] },
    { user: 'eve', isAdmin: false, roles: ['ghost'] },
  ])
  mockListRoles.mockResolvedValue([
    { name: 'reader', isAdmin: false, collectionGrants: [grant('orders', true), grant('Users', true)] },
    { name: 'writer', isAdmin: false, collectionGrants: [grant('orders', false, true), grant('logs', true, true, true)] },
    { name: 'boss', isAdmin: true, collectionGrants: [] },
  ])
  mockListCollections.mockResolvedValue(['orders', 'users', 'logs', 'secret', 'mc_users', 'photos.files'])
})

async function mountMatrix(props: Record<string, unknown> = {}) {
  const component = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampPermissionMatrix, props)) }), { route: '/' })
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 50))
  return component
}

type Mounted = Awaited<ReturnType<typeof mountMatrix>>
const cell = (c: Mounted, user: string, collection: string) => c.find(`[data-cell="${user}|${collection}"]`)
const rows = (c: Mounted) => c.findAll('tbody tr').map(tr => tr.attributes('data-row'))
const headers = (c: Mounted) => c.findAll('thead th').slice(1).map(th => th.text())

describe('MongocampPermissionMatrix', () => {
  it('hideHeading removes the heading and keeps the toolbar', async () => {
    const shown = await mountMatrix()
    expect(shown.find('h2').exists()).toBe(true)

    const hidden = await mountMatrix({ hideHeading: true })
    expect(hidden.find('h2').exists()).toBe(false)
    expect(hidden.find('button .i-lucide\\:refresh-cw, button [class*="refresh-cw"]').exists()).toBe(true)
  })

  it('shows a row per user and a column per collection, without MongoCamp\'s own collections', async () => {
    const c = await mountMatrix()
    expect(rows(c)).toEqual(['ann', 'bob', 'cy', 'dee', 'eve'])
    expect(headers(c)).toEqual(['orders', 'users', 'logs', 'secret', 'photos.files'])
    expect(c.find('[data-test="matrix-summary"]').text()).toBe('5 users × 5 collections')
  })

  it('shows what each user may do as letters, with the roles behind it', async () => {
    const c = await mountMatrix()
    expect(cell(c, 'ann', 'orders').text()).toBe('R··')
    expect(cell(c, 'bob', 'orders').text()).toBe('RW·')
    expect(cell(c, 'bob', 'logs').text()).toBe('RWA')
    expect(cell(c, 'ann', 'secret').text()).toBe('···')
    expect(cell(c, 'dee', 'secret').text()).toBe('admin')
    expect(cell(c, 'bob', 'orders').attributes('title')).toBe('read, write — via reader, writer')
    expect(cell(c, 'ann', 'secret').attributes('title')).toBe('no access')
    expect(cell(c, 'dee', 'secret').attributes('title')).toBe('administrator: everything')
  })

  it('matches grant names ignoring case', async () => {
    expect(cell(await mountMatrix(), 'ann', 'users').text()).toBe('R··') // grant "Users"
  })

  it('marks administrators and links each role to its grants page, flagging a role that no longer exists', async () => {
    const c = await mountMatrix({ grantsPath: '/roles' })
    expect(c.find('[data-row="dee"]').text()).toContain('Admin')
    const links = c.findAll('[data-row="bob"] a').map(a => a.attributes('href'))
    expect(links).toEqual(['/roles/reader', '/roles/writer'])
    expect(c.find('[data-row="eve"] a').attributes('title')).toContain('does not exist any more')
    expect(cell(c, 'eve', 'orders').text()).toBe('···')
  })

  it('does not claim to know the grants of a GridFS bucket part, and says so', async () => {
    const c = await mountMatrix()
    expect(cell(c, 'ann', 'photos.files').text()).toBe('???')
    expect(cell(c, 'ann', 'photos.files').attributes('title')).toBe('not known')
    expect(cell(c, 'dee', 'photos.files').text()).toBe('admin')
    expect(c.text()).toContain('GridFS bucket')
  })
})

describe('MongocampPermissionMatrix — filters', () => {
  it('narrows by a text that names users or collections', async () => {
    const c = await mountMatrix()
    await c.find('input').setValue('BO')
    expect(rows(c)).toEqual(['bob'])
    expect(headers(c)).toHaveLength(5)
    await c.find('input').setValue('ord')
    expect(headers(c)).toEqual(['orders'])
    expect(rows(c)).toHaveLength(5)
    await c.find('input').setValue('zzz')
    expect(c.find('[data-test="matrix-empty"]').exists()).toBe(true)
  })

  it('narrows to the users of a role', async () => {
    const c = await mountMatrix()
    c.findAllComponents(USelect).find(s => s.html().includes('aria-label="Role"'))!.vm.$emit('update:modelValue', 'writer')
    await flushPromises()
    expect(rows(c)).toEqual(['bob'])
  })

  it('has quick views with counts: users without a role, collections nobody can write or read', async () => {
    const c = await mountMatrix()
    expect(c.find('[data-test="view-users-without-roles"]').text()).toBe('Users without a role (1)')
    expect(c.find('[data-test="view-collections-nobody-writes"]').text()).toBe('Collections nobody can write (2)')
    expect(c.find('[data-test="view-collections-nobody-reads"]').text()).toBe('Collections nobody can read (1)')

    await c.find('[data-test="view-users-without-roles"]').trigger('click')
    expect(rows(c)).toEqual(['cy'])
    await c.find('[data-test="view-collections-nobody-writes"]').trigger('click')
    expect(headers(c)).toEqual(['users', 'secret'])
    expect(c.text()).toContain('Administrators can always do everything')
    await c.find('[data-test="view-collections-nobody-reads"]').trigger('click')
    expect(headers(c)).toEqual(['secret'])
    await c.find('[data-test="view-all"]').trigger('click')
    expect(headers(c)).toHaveLength(5)
  })

  it('swaps rows and columns', async () => {
    const c = await mountMatrix()
    await c.find('[aria-label="Swap rows and columns"]').trigger('click')
    expect(rows(c)).toEqual(['orders', 'users', 'logs', 'secret', 'photos.files'])
    expect(headers(c)).toEqual(['ann', 'bob', 'cy', 'dee', 'eve'])
    expect(c.find('thead th').text()).toBe('Collection')
    expect(cell(c, 'bob', 'logs').text()).toBe('RWA') // the same cell, found by user|collection
  })

  it('says how many were cut and narrows with the filter', async () => {
    const c = await mountMatrix({ maxCollections: 2, maxUsers: 3 })
    expect(headers(c)).toEqual(['orders', 'users'])
    expect(rows(c)).toEqual(['ann', 'bob', 'cy'])
    expect(c.find('[data-test="capped-collections"]').text()).toBe('Only the first 2 of 5 collections are shown. Narrow them with the filter.')
    expect(c.find('[data-test="capped-users"]').text()).toBe('Only the first 3 of 5 users are shown. Narrow them with the filter.')
  })
})

describe('MongocampPermissionMatrix — export and failure', () => {
  it('exports what is shown as CSV, one row per user', async () => {
    const c = await mountMatrix()
    await c.find('input').setValue('bob')
    await c.find('[aria-label="Export CSV"]').trigger('click')
    expect(mockDownload).toHaveBeenCalledTimes(1)
    const [name, content, mime] = mockDownload.mock.calls[0]!
    expect(name).toMatch(/^permissions-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(mime).toBe('text/csv')
    expect(content).toBe('user,roles,orders,users,logs,secret,photos.files\r\nbob,reader writer,RW,R,RWA,,?')
  })

  it('has nothing to export when nothing matches', async () => {
    const c = await mountMatrix()
    await c.find('input').setValue('zzz')
    expect(c.find('[aria-label="Export CSV"]').attributes('disabled')).toBeDefined()
  })

  it('shows an error alert and Retry loads again', async () => {
    mockListUsers.mockRejectedValueOnce(Object.assign(new Error('The request failed'), { name: 'FetchError' }))
    const c = await mountMatrix()
    expect(c.text()).toContain('Failed to load data')
    expect(c.find('[data-test="matrix-table"]').exists()).toBe(false)
    await c.findAll('button').find(b => b.text() === 'Retry')!.trigger('click')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(c.find('[data-test="matrix-table"]').exists()).toBe(true)
  })

  it('says so when there are no users and no collections', async () => {
    mockListUsers.mockResolvedValue([])
    mockListCollections.mockResolvedValue([])
    const c = await mountMatrix()
    expect(c.text()).toContain('No users or collections yet')
  })
})
