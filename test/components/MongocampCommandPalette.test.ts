import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampCommandPalette from '../../src/runtime/components/MongocampCommandPalette.vue'

enableAutoUnmount(afterEach)

const mockListUsers = vi.fn()
const mockListRoles = vi.fn()
const mockListCollections = vi.fn()
const mockListJobs = vi.fn()
const mockIsAdmin = vi.hoisted(() => ({ value: true }))
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({ listUsers: mockListUsers, listRoles: mockListRoles, listCollections: mockListCollections }),
}))
vi.mock('../../src/runtime/composables/useMongocampJobs', () => ({ useMongocampJobs: () => ({ listJobs: mockListJobs }) }))
vi.mock('../../src/runtime/composables/useMongocampRoles', () => ({
  useMongocampRoles: () => ({ isAdmin: mockIsAdmin, logoutPath: '/logout' }),
}))
vi.mock('../../src/runtime/composables/useMongocampPermissions', () => ({
  useMongocampPermissions: () => ({ canRead: (c: string) => c !== 'secret', load: async () => {} }),
}))
mockNuxtImport('navigateTo', () => mockNavigate)

beforeEach(() => {
  vi.resetAllMocks()
  mockIsAdmin.value = true
  mockListUsers.mockResolvedValue([{ user: 'ann' }])
  mockListRoles.mockResolvedValue([{ name: 'reader' }])
  mockListCollections.mockResolvedValue(['orders', 'secret'])
  mockListJobs.mockResolvedValue([{ name: 'nightly', group: 'ops' }])
})

async function mountPalette(initiallyOpen = false, props: Record<string, unknown> = {}) {
  const open = ref(initiallyOpen)
  const selected: unknown[] = []
  const c = await mountSuspended(defineComponent({
    setup: () => () => h(UApp, () => h(MongocampCommandPalette, { 'open': open.value, 'onUpdate:open': (v: boolean) => (open.value = v), 'onSelect': (e: unknown) => selected.push(e), ...props })),
  }), { route: '/' })
  await flushPromises()
  return { c, open, selected }
}
async function settle() {
  await flushPromises()
  await new Promise(r => setTimeout(r, 50))
}
const text = () => document.body.textContent ?? ''

describe('MongocampCommandPalette', () => {
  it('requests nothing until it is opened', async () => {
    await mountPalette()
    expect(mockListCollections).not.toHaveBeenCalled()
    expect(mockListUsers).not.toHaveBeenCalled()
  })

  it('loads every source on first open and lists them, minus what cannot be read', async () => {
    const { open } = await mountPalette()
    open.value = true
    await settle()
    expect(mockListCollections).toHaveBeenCalledTimes(1)
    expect(text()).toContain('orders')
    expect(text()).not.toContain('secret')
    expect(text()).toContain('ann')
    expect(text()).toContain('reader')
    expect(text()).toContain('nightly')
    expect(text()).toContain('Open server settings')
  })

  it('only loads collections for a non-admin, and hides settings', async () => {
    mockIsAdmin.value = false
    const { open } = await mountPalette()
    open.value = true
    await settle()
    expect(mockListUsers).not.toHaveBeenCalled()
    expect(mockListRoles).not.toHaveBeenCalled()
    expect(mockListJobs).not.toHaveBeenCalled()
    expect(text()).toContain('orders')
    expect(text()).not.toContain('Open server settings')
  })

  it('reuses the lists within the cache time', async () => {
    const { open } = await mountPalette()
    open.value = true
    await settle()
    open.value = false
    await settle()
    open.value = true
    await settle()
    expect(mockListCollections).toHaveBeenCalledTimes(1)
  })

  it('names a source that failed and still shows the rest', async () => {
    mockListJobs.mockRejectedValue(new Error('x'))
    const { open } = await mountPalette()
    open.value = true
    await settle()
    expect(document.body.querySelector('[data-testid="palette-failed"]')?.textContent).toContain('jobs')
    expect(text()).toContain('orders')
  })

  it('emits select and navigates to the data page of a collection', async () => {
    const { open, selected } = await mountPalette()
    open.value = true
    await settle()
    const item = [...document.body.querySelectorAll('[role="option"]')].find(el => el.textContent?.includes('orders')) as HTMLElement
    item.click()
    await settle()
    expect(selected).toHaveLength(1)
    expect(mockNavigate).toHaveBeenCalledWith('/secured/admin/collections/orders/data')
    expect(open.value).toBe(false)
  })

  it('does not navigate with navigate=false', async () => {
    const { open, selected } = await mountPalette(false, { navigate: false })
    open.value = true
    await settle()
    const item = [...document.body.querySelectorAll('[role="option"]')].find(el => el.textContent?.includes('ann')) as HTMLElement
    item.click()
    await settle()
    expect(selected).toHaveLength(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
