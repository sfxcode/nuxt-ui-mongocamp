import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampServerInfo from '../../src/runtime/components/MongocampServerInfo.vue'

enableAutoUnmount(afterEach)

const getServerInfo = vi.fn()
const getStats = vi.fn()
const getCapabilities = vi.fn()

mockNuxtImport('useMongocampSystem', () => () => ({ getServerInfo, getStats, getCapabilities }))

const stats = {
  partial: false,
  uptimeSeconds: 199136,
  connections: { current: 296, available: 113, totalCreated: 271277 },
  opcounters: { insert: 15560, query: 107989, update: 95994, _delete: 16550, getmore: 0, command: 4294217 },
}
const capabilities = {
  serverVersion: '1.9.0',
  mongoDbMajor: 9,
  features: ['permissions', 'export'],
  limits: { importMaxBytes: 1073741824, grantDeniedStatus: 401 },
  aggregationStagesDenied: ['$out', '$function'],
}

beforeEach(() => {
  vi.resetAllMocks()
  getServerInfo.mockResolvedValue({ mongoDbVersion: '9.0.4', mongoDbVersionArray: [9, 0, 4, 0] })
  getStats.mockResolvedValue(stats)
  getCapabilities.mockResolvedValue(capabilities)
})

async function mountInfo(props: Record<string, unknown> = {}) {
  const c = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampServerInfo, props)) }), { route: '/' })
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 50))
  return c
}

describe('MongocampServerInfo', () => {
  it('shows the versions, uptime, connections and counters', async () => {
    const c = await mountInfo()

    expect(c.find('[data-testid="mongodb-version"]').text()).toBe('9.0.4')
    expect(c.find('[data-testid="uptime"]').text()).toBe('2d 7h')
    expect(c.find('[data-testid="connections-current"]').text()).toBe('296')
    expect(c.find('[data-testid="op-command"]').text()).toBe('4 294 217')
  })

  it('shows the capabilities: features, limits and refused operators', async () => {
    const c = await mountInfo()

    expect(c.find('[data-testid="features"]').text()).toContain('permissions')
    expect(c.find('[data-testid="import-max"]').text()).toBe('1.0 GB')
    expect(c.find('[data-testid="grant-denied"]').text()).toBe('401')
    expect(c.find('[data-testid="denied-stages"]').text()).toContain('$function')
  })

  it('explains a partial answer instead of showing zeros', async () => {
    getStats.mockResolvedValue({ partial: true })
    const c = await mountInfo()

    expect(c.find('[data-testid="stats-partial"]').exists()).toBe(true)
    expect(c.find('[data-testid="connections-current"]').exists()).toBe(false)
  })

  it('names a failing part and keeps the others', async () => {
    getStats.mockRejectedValue(new Error('boom'))
    const c = await mountInfo()

    expect(c.find('[data-testid="stats-failed"]').exists()).toBe(true)
    expect(c.find('[data-testid="mongodb-version"]').text()).toBe('9.0.4')
    expect(c.find('[data-testid="features"]').exists()).toBe(true)
  })

  it('says "older server" for a missing capabilities route, not "failed"', async () => {
    getCapabilities.mockRejectedValue({ response: { status: 404 } })
    const c = await mountInfo()

    expect(c.find('[data-testid="older-server"]').exists()).toBe(true)
    expect(c.find('[data-testid="capabilities-failed"]').exists()).toBe(false)
  })

  it('skips the requests of hidden parts', async () => {
    await mountInfo({ hideStats: true, hideCapabilities: true })

    expect(getStats).not.toHaveBeenCalled()
    expect(getCapabilities).not.toHaveBeenCalled()
  })
})
