import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { UApp } from '#components'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MongocampServerStatus from '../../src/runtime/components/MongocampServerStatus.vue'

const { getServerInfo, getStats, storage } = vi.hoisted(() => ({
  getServerInfo: vi.fn(),
  getStats: vi.fn(),
  storage: { value: { profile: { isAdmin: true } } as { profile?: { isAdmin?: boolean } } | undefined },
}))

mockNuxtImport('useMongocampSystem', () => () => ({ getServerInfo, getStats }))
mockNuxtImport('useMongocampStorage', () => () => storage)

const mount = (props: Record<string, unknown> = {}) =>
  mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampServerStatus, { autoRefresh: 0, ...props })) }), { route: '/' })
const status = (component: Awaited<ReturnType<typeof mount>>) => component.find('[data-test="server-status"]')

beforeEach(() => {
  vi.clearAllMocks()
  storage.value = { profile: { isAdmin: true } }
  getServerInfo.mockResolvedValue({ mongoDbVersion: '9.0.4', mongoDbVersionArray: [9, 0, 4, 0] })
  getStats.mockResolvedValue({ uptimeSeconds: 3 * 86400 + 4 * 3600, connections: { current: 25, available: 75 } })
})

describe('MongocampServerStatus', () => {
  it('shows versions, connections with a meter and the uptime for an administrator, linked to the server page', async () => {
    const component = await mount()
    await vi.waitFor(() => expect(status(component).attributes('data-health')).toBe('ok'))

    expect(component.text()).toContain('MongoDB 9.0.4')
    expect(component.text()).toContain('Connections')
    expect(component.text()).toContain('Up 3d 4h')
    const meter = component.find('[role="meter"]')
    expect(meter.attributes('aria-valuenow')).toBe('25')
    expect(status(component).element.tagName).toBe('A')
    expect(status(component).attributes('href')).toBe('/secured/admin/server')
    // Named by its visible text (label-in-name), with where it leads as screen-reader text
    expect(status(component).attributes('aria-label')).toBeUndefined()
    expect(status(component).findAll('.sr-only').at(-1)?.text()).toBe('Server status details')
  })

  it('does not ask a known non-administrator for the load, shows no link, and is still ok', async () => {
    storage.value = { profile: { isAdmin: false } }
    const component = await mount()
    await vi.waitFor(() => expect(component.text()).toContain('MongoDB 9.0.4'))

    expect(getStats).not.toHaveBeenCalled()
    expect(status(component).attributes('data-health')).toBe('ok')
    expect(status(component).element.tagName).toBe('DIV')
    expect(component.find('[role="meter"]').exists()).toBe(false)
  })

  it('is partial when the load is refused but the server answers', async () => {
    getStats.mockRejectedValue(new Error('403'))
    const component = await mount()
    await vi.waitFor(() => expect(status(component).attributes('data-health')).toBe('partial'))

    expect(component.text()).toContain('MongoDB 9.0.4')
    expect(component.find('[role="meter"]').exists()).toBe(false)
  })

  it('is partial when the load has no connection numbers', async () => {
    getStats.mockResolvedValue({ partial: true })
    const component = await mount()
    await vi.waitFor(() => expect(status(component).attributes('data-health')).toBe('partial'))
  })

  it('is partial, not down, on a server without the endpoints (it answered 404)', async () => {
    getServerInfo.mockRejectedValue({ response: { status: 404 } })
    getStats.mockRejectedValue({ response: { status: 404 } })
    const component = await mount()
    await vi.waitFor(() => expect(status(component).attributes('data-health')).toBe('partial'))
  })

  it('says the server is not reachable when nothing answers', async () => {
    getServerInfo.mockRejectedValue(new Error('down'))
    getStats.mockRejectedValue(new Error('down'))
    const component = await mount()
    await vi.waitFor(() => expect(status(component).attributes('data-health')).toBe('down'))

    expect(component.text()).toContain('Server not reachable')
  })

  it('asks nothing without a session', async () => {
    storage.value = {}
    await mount()
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(getServerInfo).not.toHaveBeenCalled()
    expect(getStats).not.toHaveBeenCalled()
  })

  it('collapsed shows only a labelled dot', async () => {
    const component = await mount({ collapsed: true })
    await vi.waitFor(() => expect(status(component).attributes('data-health')).toBe('ok'))

    expect(status(component).attributes('aria-label')).toBe('Server reachable')
    expect(component.text()).not.toContain('MongoDB')
  })

  it('detailsPath changes the link, and an empty one removes it', async () => {
    const linked = await mount({ detailsPath: '/status' })
    await vi.waitFor(() => expect(status(linked).attributes('data-health')).toBe('ok'))
    expect(status(linked).attributes('href')).toBe('/status')

    const plain = await mount({ detailsPath: '' })
    await vi.waitFor(() => expect(status(plain).attributes('data-health')).toBe('ok'))
    expect(status(plain).element.tagName).toBe('DIV')
  })
})
