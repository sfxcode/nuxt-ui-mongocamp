import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

type Profile = { user: string, isAdmin: boolean, roles: string[], grants?: unknown } | undefined
const mockState = ref<{ profile?: Profile }>({})
let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

const mockUserPermissions = vi.fn()
const mockCache = ref<{ user: string, byName: Record<string, unknown>, complete: boolean }>({ user: '', byName: {}, complete: false })

vi.mock('#imports', () => ({
  useMongocampStorage: () => mockState,
  useMongocampClientApi: () => ({ authApi: { userPermissions: mockUserPermissions } }),
  useState: () => mockCache,
}))

// must come after vi.mock — a static top-level import would resolve before the mocks are wired up
const { useMongocampPermissions } = await import('../src/runtime/composables/useMongocampPermissions')

const row = (name: string, read: boolean, write: boolean, administrate = false) => ({ name, read, write, administrate })
const signIn = (isAdmin = false, user = 'carol') => {
  mockState.value = { profile: { user, isAdmin, roles: ['support'] } }
}

beforeEach(() => {
  mockOptions = {}
  mockState.value = {}
  mockCache.value = { user: '', byName: {}, complete: false }
  mockUserPermissions.mockReset()
})

describe('useMongocampPermissions', () => {
  it('fails open before the server has answered', () => {
    signIn()
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('customers'), canWrite('customers'), canAdminister('customers')]).toEqual([true, true, true])
  })

  it('never reads grants from the session profile', () => {
    mockState.value = { profile: { user: 'carol', isAdmin: false, roles: [], grants: [{ name: 'customers', read: true, write: false, administrate: false, grantType: 'COLLECTION' }] } }

    expect(useMongocampPermissions().canWrite('customers')).toBe(true)
  })

  it('lets an administrator do everything', () => {
    signIn(true)
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('anything'), canWrite('anything'), canAdminister('anything')]).toEqual([true, true, true])
  })

  it('fails open without a profile', () => {
    expect(useMongocampPermissions().canWrite('customers')).toBe(true)
  })

  it('allows everything in server proxy mode — there is no user, the api key\'s power is the server\'s decision', () => {
    mockOptions = { useServerProxy: true }
    signIn()
    const { canRead, canWrite, canAdminister } = useMongocampPermissions()

    expect([canRead('x'), canWrite('x'), canAdminister('x')]).toEqual([true, true, true])
  })

  it('keeps every collection of the list while nothing is known', () => {
    signIn()

    expect(useMongocampPermissions().readableCollections(['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('useMongocampPermissions.load (server answers)', () => {
  it('answers from the server for one collection, name ignoring case', async () => {
    signIn()
    mockUserPermissions.mockResolvedValue([row('Customers', true, true)])
    const { canWrite, canAdminister, load } = useMongocampPermissions()

    await load('customers')

    expect(mockUserPermissions).toHaveBeenCalledWith({ collection: 'customers' }, expect.anything())
    expect(canWrite('customers')).toBe(true)
    expect(canAdminister('CUSTOMERS')).toBe(false)
  })

  it('treats a collection missing from a full answer as not granted', async () => {
    signIn()
    mockUserPermissions.mockResolvedValue([row('b', true, false), row('d', false, true), row('a', true, true)])
    const { canRead, canWrite, readableCollections, load } = useMongocampPermissions()

    await load()

    expect(mockUserPermissions.mock.calls[0]![0]).toEqual({})
    expect(readableCollections(['a', 'b', 'c', 'd'])).toEqual(['a', 'b'])
    expect([canRead('c'), canWrite('c')]).toEqual([false, false])
  })

  it('stays fail-open for unlisted collections after a single-collection answer', async () => {
    signIn()
    mockUserPermissions.mockResolvedValue([row('a', true, false)])
    const { canWrite, load } = useMongocampPermissions()

    await load('a')

    expect([canWrite('a'), canWrite('other')]).toEqual([false, true])
  })

  it('keeps the full answer complete when one collection is asked again', async () => {
    signIn()
    mockUserPermissions.mockResolvedValueOnce([row('a', true, false)])
    mockUserPermissions.mockResolvedValueOnce([row('b', false, false)])
    const { canRead, load } = useMongocampPermissions()

    await load()
    await load('b')

    expect([canRead('a'), canRead('b'), canRead('c')]).toEqual([true, false, false])
  })

  it('lets GridFS bucket members through even after a full answer', async () => {
    signIn()
    mockUserPermissions.mockResolvedValue([])
    const { canRead, load } = useMongocampPermissions()

    await load()

    expect([canRead('images.files'), canRead('orders')]).toEqual([true, false])
  })

  it('works without a profile in server proxy mode', async () => {
    mockOptions = { useServerProxy: true }
    mockUserPermissions.mockResolvedValue([row('orders', true, false)])
    const { canWrite, canRead, load } = useMongocampPermissions()
    expect(canWrite('orders')).toBe(true) // fail-open until the server has answered

    await load('orders')

    expect([canRead('orders'), canWrite('orders')]).toEqual([true, false])
  })

  it('never asks for an administrator', async () => {
    signIn(true)
    await useMongocampPermissions().load()

    expect(mockUserPermissions).not.toHaveBeenCalled()
  })

  it('stays fail-open when the request fails', async () => {
    signIn()
    mockUserPermissions.mockRejectedValue(new Error('down'))
    const { canWrite, load } = useMongocampPermissions()

    await expect(load()).resolves.toBeUndefined()

    expect(canWrite('customers')).toBe(true)
  })

  it('forgets the answers of another user', async () => {
    signIn()
    mockUserPermissions.mockResolvedValue([row('customers', true, false)])
    const { canWrite, canRead, load } = useMongocampPermissions()
    await load()
    expect([canWrite('customers'), canRead('orders')]).toEqual([false, false])

    signIn(false, 'dave')

    expect([canWrite('customers'), canRead('orders')]).toEqual([true, true])
  })
})
