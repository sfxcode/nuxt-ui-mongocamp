import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampDashboard from '../../src/runtime/components/MongocampDashboard.vue'

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
})
