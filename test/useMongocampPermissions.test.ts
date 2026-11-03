import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

type Profile = { user: string, isAdmin: boolean, roles: string[], grants?: unknown } | undefined
const mockState = ref<{ profile?: Profile }>({})
let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

vi.mock('#imports', () => ({
  useMongocampStorage: () => mockState,
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
