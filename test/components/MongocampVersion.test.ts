import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import MongocampVersion from '../../src/runtime/components/MongocampVersion.vue'

const { getServerInfo, storage } = vi.hoisted(() => ({
  getServerInfo: vi.fn(),
  storage: { value: { profile: { isAdmin: true } } as { profile?: unknown } | undefined },
}))

mockNuxtImport('useMongocampSystem', () => () => ({ getServerInfo }))
mockNuxtImport('useMongocampStorage', () => () => storage)

beforeEach(() => {
  vi.clearAllMocks()
  storage.value = { profile: { isAdmin: true } }
})

describe('MongocampVersion', () => {
  it('mounts without crashing', async () => {
    getServerInfo.mockResolvedValue({ mongoDbVersion: '9.0.4', mongoDbVersionArray: [9, 0, 4, 0] })
    const component = await mountSuspended(MongocampVersion)
    expect(component.html()).toBeTruthy()
  })

  it('shows the MongoDB version when logged in', async () => {
    getServerInfo.mockResolvedValue({ mongoDbVersion: '9.0.4', mongoDbVersionArray: [9, 0, 4, 0] })
    const component = await mountSuspended(MongocampVersion)
    await vi.waitFor(() => expect(component.text()).toContain('MongoDB 9.0.4'))
  })

  it('asks nothing without a session', async () => {
    storage.value = undefined
    const component = await mountSuspended(MongocampVersion)
    expect(getServerInfo).not.toHaveBeenCalled()
    expect(component.text()).not.toContain('MongoDB')
  })

  it('leaves the badge out when the server cannot tell', async () => {
    getServerInfo.mockRejectedValue(new Error('404'))
    const component = await mountSuspended(MongocampVersion)
    await vi.waitFor(() => expect(getServerInfo).toHaveBeenCalled())
    expect(component.text()).not.toContain('MongoDB')
  })

  it('hideDatabase skips the request', async () => {
    const component = await mountSuspended(MongocampVersion, { props: { hideDatabase: true } })
    expect(getServerInfo).not.toHaveBeenCalled()
    expect(component.text()).not.toContain('MongoDB')
  })
})
