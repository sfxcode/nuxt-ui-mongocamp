import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

type Profile = { user: string, isAdmin: boolean, roles: string[], grants?: unknown } | undefined
const mockState = ref<{ profile?: Profile }>({})
let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

const mockUserPermissions = vi.fn()
const mockCache = ref<{ user: string, byName: Record<string, unknown> }>({ user: '', byName: {} })

vi.mock('#imports', () => ({
  useMongocampStorage: () => mockState,
  useMongocampClientApi: () => ({ authApi: { userPermissions: mockUserPermissions } }),
  useState: () => mockCache,
}))

// must come after vi.mock — a static top-level import would resolve before the mocks are wired up
const { useMongocampPermissions } = await import('../src/runtime/composables/useMongocampPermissions')

const grant = (name: string, read: boolean, write: boolean, administrate = false) => ({ name, read, write, administrate, grantType: 'COLLECTION' })
const signIn = (grants: unknown, isAdmin = false) => {
  mockState.value = { profile: { user: 'carol', isAdmin, roles: ['support'], grants } }
}

beforeEach(() => {
  mockOptions = {}
  mockState.value = {}
  mockCache.value = { user: '', byName: {} }
  mockUserPermissions.mockReset()
})

describe('useMongocampPermissions', () => {
  it('answers read / write / administer from the grants of the profile', () => {
    signIn([grant('customers', true, false), grant('orders', true, true, true)])
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('customers'), canWrite('customers'), canAdminister('customers')]).toEqual([true, false, false])
    expect([canRead('orders'), canWrite('orders'), canAdminister('orders')]).toEqual([true, true, true])
  })

  it('says no to everything for a collection without a grant', () => {
    signIn([grant('customers', true, true)])
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('invoices'), canWrite('invoices'), canAdminister('invoices')]).toEqual([false, false, false])
  })

  it('lets an administrator do everything, whatever the grants say', () => {
    signIn([], true)
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('anything'), canWrite('anything'), canAdminister('anything')]).toEqual([true, true, true])
  })

  it('fails open when it cannot know: no grant list, no profile, a GridFS bucket member', () => {
    const { canWrite } = useMongocampPermissions()

    signIn(undefined)
    expect(canWrite('customers')).toBe(true)

    mockState.value = {}
    expect(canWrite('customers')).toBe(true)

    signIn([grant('customers', true, false)])
    expect(canWrite('images.files')).toBe(true)
  })

  it('allows everything in server proxy mode — there is no user, the api key\'s power is the server\'s decision', () => {
    mockOptions = { useServerProxy: true }
    signIn([])
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('x'), canWrite('x'), canAdminister('x')]).toEqual([true, true, true])
  })

  it('follows the profile when it changes, because it is read on every call', () => {
    const { canWrite } = useMongocampPermissions()
    signIn([grant('customers', true, false)])
    expect(canWrite('customers')).toBe(false)

    signIn([grant('customers', true, true)])
    expect(canWrite('customers')).toBe(true)
  })

  it('filters a list down to the readable collections, keeping the order', () => {
    signIn([grant('b', true, false), grant('d', false, true), grant('a', true, true)])
    const { readableCollections } = useMongocampPermissions()

    expect(readableCollections(['a', 'b', 'c', 'd'])).toEqual(['a', 'b'])
    expect(readableCollections([])).toEqual([])
  })

  it('keeps every collection of the list when the grants are unknown', () => {
    signIn(undefined)

    expect(useMongocampPermissions().readableCollections(['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('useMongocampPermissions.load (server answers)', () => {
  it('lets the server answer win over the grants of the profile', async () => {
    signIn([grant('customers', true, false)])
    mockUserPermissions.mockResolvedValue([{ name: 'Customers', read: true, write: true, administrate: false }])
    const { canWrite, canAdminister, load } = useMongocampPermissions()
    expect(canWrite('customers')).toBe(false)

    await load('customers')

    expect(mockUserPermissions).toHaveBeenCalledWith({ collection: 'customers' }, expect.anything())
    expect(canWrite('customers')).toBe(true)
    expect(canAdminister('CUSTOMERS')).toBe(false)
  })

  it('asks for every collection without an argument and keeps earlier answers', async () => {
    signIn([])
    mockUserPermissions.mockResolvedValueOnce([{ name: 'a', read: true, write: false, administrate: false }])
    mockUserPermissions.mockResolvedValueOnce([{ name: 'b', read: false, write: false, administrate: false }])
    const { canRead, load } = useMongocampPermissions()

    await load()
    await load('b')

    expect(mockUserPermissions.mock.calls[0]![0]).toEqual({})
    expect([canRead('a'), canRead('b')]).toEqual([true, false])
  })

  it('works without a profile in server proxy mode', async () => {
    mockOptions = { useServerProxy: true }
    mockUserPermissions.mockResolvedValue([{ name: 'orders', read: true, write: false, administrate: false }])
    const { canWrite, canRead, load } = useMongocampPermissions()
    expect(canWrite('orders')).toBe(true) // fail-open until the server has answered

    await load('orders')

    expect([canRead('orders'), canWrite('orders')]).toEqual([true, false])
  })

  it('never asks for an administrator', async () => {
    signIn([], true)
    await useMongocampPermissions().load()

    expect(mockUserPermissions).not.toHaveBeenCalled()
  })

  it('keeps answering from the grants when the request fails', async () => {
    signIn([grant('customers', true, false)])
    mockUserPermissions.mockRejectedValue(new Error('down'))
    const { canWrite, load } = useMongocampPermissions()

    await expect(load()).resolves.toBeUndefined()

    expect(canWrite('customers')).toBe(false)
  })

  it('forgets the answers of another user', async () => {
    signIn([grant('customers', true, false)])
    mockUserPermissions.mockResolvedValue([{ name: 'customers', read: true, write: true, administrate: true }])
    const { canWrite, load } = useMongocampPermissions()
    await load()
    expect(canWrite('customers')).toBe(true)

    mockState.value = { profile: { user: 'dave', isAdmin: false, roles: [], grants: [grant('customers', true, false)] } }

    expect(canWrite('customers')).toBe(false)
  })
})
