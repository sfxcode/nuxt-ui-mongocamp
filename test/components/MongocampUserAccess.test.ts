import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MongocampUserAccess from '../../src/runtime/components/MongocampUserAccess.vue'

const { userPermissions, storage } = vi.hoisted(() => ({
  userPermissions: vi.fn(),
  storage: { value: { profile: { user: 'carol', isAdmin: false } } as { profile?: { user?: string, isAdmin?: boolean } } | undefined },
}))

mockNuxtImport('useMongocampClientApi', () => () => ({ authApi: { userPermissions } }))
mockNuxtImport('useMongocampStorage', () => () => storage)

const exposed: { current: { refresh?: () => Promise<void> } | null } = { current: null }
const mount = (props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) =>
  mountSuspended(defineComponent({
    setup: () => () => h(UApp, () => h(MongocampUserAccess, { ...props, ref: (el: unknown) => {
      exposed.current = el as typeof exposed.current
    } }, slots)),
  }), { route: '/' })

const ROWS = [
  { name: 'orders', read: true, write: true, administrate: false },
  { name: 'mc_users', read: true, write: false, administrate: false },
  { name: 'customers', read: true, write: false, administrate: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  storage.value = { profile: { user: 'carol', isAdmin: false } }
  userPermissions.mockResolvedValue(ROWS)
})

describe('MongocampUserAccess', () => {
  it('lists the collections the server grants, sorted, without MongoCamp\'s own', async () => {
    const component = await mount()
    await vi.waitFor(() => expect(component.findAll('tbody tr')).toHaveLength(2))

    expect(component.findAll('tbody tr').map(row => row.find('th').text())).toEqual(['customers', 'orders'])
    expect(component.findAll('tbody tr')[1]!.findAll('td').map(cell => cell.text())).toEqual(['Yes', 'Yes', 'No'])
    expect(component.find('h2').text()).toBe('Your access')
  })

  it('counts what the user can do', async () => {
    const component = await mount()
    await vi.waitFor(() => expect(component.findAll('tbody tr')).toHaveLength(2))

    const stat = (key: string) => component.find(`[data-test="access-stat-${key}"]`).text()
    expect(stat('collections')).toMatch(/2\s*Collections/)
    expect(stat('read')).toMatch(/2\s*Can read/)
    expect(stat('write')).toMatch(/1\s*Can write/)
    expect(stat('administrate')).toMatch(/0\s*Can administrate/)
  })

  it('tells an administrator they may do everything, without a request', async () => {
    storage.value = { profile: { user: 'admin', isAdmin: true } }
    const component = await mount()

    expect(component.find('[data-test="admin-access"]').exists()).toBe(true)
    expect(component.text()).toContain('You are an administrator')
    expect(userPermissions).not.toHaveBeenCalled()
    expect(component.find('table').exists()).toBe(false)
  })

  it('shows an empty state when nothing is granted', async () => {
    userPermissions.mockResolvedValue([])
    const component = await mount()
    await vi.waitFor(() => expect(component.text()).toContain('No collections yet'))

    expect(component.find('table').exists()).toBe(false)
  })

  it('shows the error and loads again on retry', async () => {
    userPermissions.mockRejectedValueOnce(Object.assign(new Error('The request failed'), { name: 'FetchError' }))
    const component = await mount()
    await vi.waitFor(() => expect(component.find('[role="alert"], [data-slot="root"]').exists()).toBe(true))
    expect(component.find('table').exists()).toBe(false)
    expect(component.text()).not.toContain('No collections yet')

    await exposed.current!.refresh!()
    await vi.waitFor(() => expect(component.findAll('tbody tr')).toHaveLength(2))
    expect(userPermissions).toHaveBeenCalledTimes(2)
  })

  it('hideHeading, hideRefresh and hideStats remove their part; the toolbar slot stays', async () => {
    const component = await mount({ hideHeading: true, hideRefresh: true, hideStats: true }, { toolbar: () => h('button', { 'data-test': 'mine' }, 'Mine') })
    await vi.waitFor(() => expect(component.findAll('tbody tr')).toHaveLength(2))

    expect(component.find('h2').exists()).toBe(false)
    expect(component.find('button[aria-label="Refresh"]').exists()).toBe(false)
    expect(component.find('[data-test="access-stat-read"]').exists()).toBe(false)
    expect(component.find('[data-test="mine"]').exists()).toBe(true)
    expect(typeof exposed.current?.refresh).toBe('function')
  })

  it('asks with a timeout', async () => {
    await mount()
    await vi.waitFor(() => expect(userPermissions).toHaveBeenCalled())

    expect(userPermissions.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })
})
