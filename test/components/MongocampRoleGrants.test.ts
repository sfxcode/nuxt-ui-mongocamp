import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampRoleGrants from '../../src/runtime/components/MongocampRoleGrants.vue'

// See test/components/MongocampRoles.test.ts for why each of these helpers is needed.
enableAutoUnmount(afterEach)

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function modal() {
  return new DOMWrapper(document.body)
}

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

const mockListRoles = vi.fn()
const mockUpdateRole = vi.fn()
const mockListCollections = vi.fn()

// MongocampRoleGrants.vue imports useMongocampAdmin via a relative path, not a Nuxt
// auto-import — same mocking mechanism as test/components/MongocampRoles.test.ts.
vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({
    listRoles: mockListRoles,
    updateRole: mockUpdateRole,
    listCollections: mockListCollections,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockListCollections.mockResolvedValue([])
})

describe('MongocampRoleGrants', () => {
  it('fetches the named role on mount and renders its grants', async () => {
    mockListRoles.mockResolvedValueOnce([
      { name: 'other', isAdmin: false, collectionGrants: [] },
      { name: 'support', isAdmin: false, collectionGrants: [{ name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }] },
    ])

    const component = await mountSuspended(withUApp(MongocampRoleGrants), {
      route: '/',
      props: { roleName: 'support' },
    })
    await flushPromises()

    expect(component.text()).toContain('Grants: support')
    expect(component.text()).toContain('users')
  })

  it('removes a grant: clicking remove calls updateRole with the remaining grants and does not mutate the fetched API response', async () => {
    const originalGrants = [
      { name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' },
      { name: 'orders', read: true, write: true, administrate: false, grantType: 'COLLECTION' },
    ]
    mockListRoles.mockResolvedValueOnce([{ name: 'support', isAdmin: false, collectionGrants: originalGrants }])

    const component = await mountSuspended(withUApp(MongocampRoleGrants), {
      route: '/',
      props: { roleName: 'support' },
    })
    await flushPromises()

    const removeButtons = component.findAll('[aria-label="Remove grant"]')
    await removeButtons[0]!.trigger('click')
    await flushPromises()

    expect(mockUpdateRole).toHaveBeenCalledWith('support', false, [
      { name: 'orders', read: true, write: true, administrate: false, grantType: 'COLLECTION' },
    ])
    // The component must clone grants on fetch (not hold a live reference into the mocked API
    // response) — otherwise splicing the component's own array would also mutate this array.
    expect(originalGrants).toHaveLength(2)
  })

  it('edits a grant: submitting the edit form round-trips the existing grant values via a full-array updateRole call', async () => {
    mockListRoles.mockResolvedValueOnce([
      { name: 'support', isAdmin: false, collectionGrants: [{ name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }] },
    ])

    const component = await mountSuspended(withUApp(MongocampRoleGrants), {
      route: '/',
      props: { roleName: 'support' },
    })
    await flushPromises()

    await component.find('[aria-label="Edit grant"]').trigger('click')
    await wait()
    expect(modal().text()).toContain('Edit Grant: users')

    await modal().find('form').trigger('submit')
    await flushPromises()

    expect(mockUpdateRole).toHaveBeenCalledWith('support', false, [
      { name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' },
    ])
  })
})
