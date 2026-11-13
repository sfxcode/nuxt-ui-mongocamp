import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MongocampDashboard from '../../src/runtime/components/MongocampDashboard.vue'

// these components are for administrators: the gate (useMongocampAdminGate) lets an admin profile through
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'admin@example.com', isAdmin: true, roles: [] } } }))

// UTooltip needs a UApp provider — see test/components/MongocampRoles.test.ts
function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h(UApp, () => h(component as never, attrs, slots))
    },
  })
}

const mockListUsers = vi.fn()
const mockListRoles = vi.fn()
const mockListCollections = vi.fn()

vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({
    listUsers: mockListUsers,
    listRoles: mockListRoles,
    listCollections: mockListCollections,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockListUsers.mockResolvedValue([{}, {}])
  mockListRoles.mockResolvedValue([{}, {}, {}])
  mockListCollections.mockResolvedValue(['a', 'b', 'c', 'd'])
})

describe('MongocampDashboard', () => {
  it('hideRefresh removes the reload button; refresh() stays exposed', async () => {
    const exposed: { current: { refresh?: () => unknown } | null } = { current: null }
    const component = await mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(MongocampDashboard, { hideRefresh: true, ref: (el: unknown) => { exposed.current = el as typeof exposed.current } })),
    }), { route: '/' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(component.find('button[aria-label="Refresh"]').exists()).toBe(false)
    expect(typeof exposed.current?.refresh).toBe('function')
  })

  it('hideHeading removes the heading and keeps the toolbar', async () => {
    const shown = await mountSuspended(withUApp(MongocampDashboard), { route: '/' })
    expect(shown.find('h1').exists()).toBe(true)

    const hidden = await mountSuspended(withUApp(MongocampDashboard), { route: '/', props: { hideHeading: true } })
    expect(hidden.find('h1').exists()).toBe(false)
    expect(hidden.find('button[aria-label="Refresh"]').exists()).toBe(true)
  })

  it('counts collections, users and roles from the admin composable and links each card', async () => {
    const component = await mountSuspended(withUApp(MongocampDashboard), { route: '/' })
    await flushPromises()

    const cards = component.findAll('a').map(a => ({ href: a.attributes('href'), text: a.text() }))
    expect(cards).toEqual([
      { href: '/secured/admin/collections', text: expect.stringMatching(/4\s*Collections/) },
      { href: '/secured/admin/users', text: expect.stringMatching(/2\s*Users/) },
      { href: '/secured/admin/roles', text: expect.stringMatching(/3\s*Roles/) },
    ])
  })

  it('uses the configurable link targets', async () => {
    const component = await mountSuspended(withUApp(MongocampDashboard), {
      route: '/',
      props: { collectionsPath: '/c', usersPath: '/u', rolesPath: '/r' },
    })
    await flushPromises()

    expect(component.findAll('a').map(a => a.attributes('href'))).toEqual(['/c', '/u', '/r'])
  })

  it('shows an error alert instead of zeros when loading fails, and retry recounts', async () => {
    mockListUsers.mockRejectedValueOnce(Object.assign(new Error('The request failed'), { name: 'FetchError' }))
    const component = await mountSuspended(withUApp(MongocampDashboard), { route: '/' })
    await flushPromises()

    expect(component.text()).toContain('Failed to load data')
    expect(component.text()).not.toMatch(/\b0\s*Users/)

    await component.findAll('button').find(b => b.text() === 'Retry')?.trigger('click')
    await flushPromises()
    expect(component.text()).not.toContain('Failed to load data')
    expect(component.text()).toMatch(/2\s*Users/)
  })

  it('renders its default slot below the stat cards', async () => {
    const component = await mountSuspended(withUApp(MongocampDashboard), {
      route: '/',
      slots: { default: () => h('p', 'extra content') },
    })
    await flushPromises()

    expect(component.text()).toContain('extra content')
  })

  describe('autoRefresh', () => {
    const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    it('does not reload on its own by default', async () => {
      await mountSuspended(withUApp(MongocampDashboard), { route: '/' })
      await flushPromises()
      await waitMs(1300)
      expect(mockListUsers).toHaveBeenCalledTimes(1)
    })

    it('recounts every N seconds and stops when unmounted', async () => {
      const component = await mountSuspended(withUApp(MongocampDashboard), { route: '/', props: { autoRefresh: 1 } })
      await flushPromises()
      expect(mockListUsers).toHaveBeenCalledTimes(1)
      mockListUsers.mockResolvedValue([{}, {}, {}, {}, {}])
      await waitMs(1300)
      expect(mockListUsers.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(component.text()).toMatch(/5\s*Users/)

      component.unmount()
      const calls = mockListUsers.mock.calls.length
      await waitMs(1300)
      expect(mockListUsers).toHaveBeenCalledTimes(calls)
    })

    it('keeps the numbers on screen when a background reload fails', async () => {
      const component = await mountSuspended(withUApp(MongocampDashboard), { route: '/', props: { autoRefresh: 1 } })
      await flushPromises()
      mockListUsers.mockRejectedValue(Object.assign(new Error('The request failed'), { name: 'FetchError' }))
      await waitMs(1300)
      await flushPromises()
      expect(component.text()).toMatch(/2\s*Users/)
      expect(component.text()).toContain('Failed to load data')
    })
  })
})
