import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp, USelectMenu } from '#components'
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

  it('shows an error alert when loading the role fails, and the empty state once the retry returns no grants', async () => {
    mockListRoles.mockRejectedValueOnce(Object.assign(new Error('The request failed'), { name: 'FetchError' }))
    mockListRoles.mockResolvedValueOnce([{ name: 'support', isAdmin: false, collectionGrants: [] }])

    const component = await mountSuspended(withUApp(MongocampRoleGrants), {
      route: '/',
      props: { roleName: 'support' },
    })
    await flushPromises()
    expect(component.text()).toContain('Failed to load data')

    await component.findAll('button').find(b => b.text() === 'Retry')?.trigger('click')
    await flushPromises()
    expect(component.text()).not.toContain('Failed to load data')
    expect(component.text()).toContain('No grants yet')
  })

  describe('when saving fails', () => {
    const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })
    const usersGrant = { name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }
    const ordersGrant = { name: 'orders', read: true, write: true, administrate: false, grantType: 'COLLECTION' }

    async function mountRole(grants: unknown[] = [usersGrant, ordersGrant]) {
      mockListRoles.mockResolvedValue([{ name: 'support', isAdmin: false, collectionGrants: grants.map(g => ({ ...(g as object) })) }])
      const component = await mountSuspended(withUApp(MongocampRoleGrants), {
        route: '/',
        props: { roleName: 'support' },
      })
      await flushPromises()
      return component
    }

    it('keeps the grant in the table and shows why when a remove is refused', async () => {
      const component = await mountRole()
      mockUpdateRole.mockRejectedValueOnce(fetchError)

      await component.findAll('[aria-label="Remove grant"]')[0]!.trigger('click')
      await flushPromises()

      // the server still has both grants, so the table must too
      expect(component.text()).toContain('users')
      expect(component.text()).toContain('orders')
      expect(component.text()).toContain('could not be reached')
    })

    it('does not show an edit the server refused: the dialog stays open with the reason and the table is unchanged', async () => {
      const component = await mountRole([usersGrant])
      mockUpdateRole.mockRejectedValueOnce(fetchError)
      expect(component.find('tbody').text().match(/Yes/g)).toHaveLength(1) // only "read" is granted

      await component.find('[aria-label="Edit grant"]').trigger('click')
      await wait()
      await modal().findAll('button[role="switch"]')[1]!.trigger('click') // also grant "write"
      await wait() // FormKit debounces validation — a submit before it settles is ignored
      await modal().find('form').trigger('submit')
      await flushPromises()

      expect(modal().text()).toContain('Edit Grant: users')
      expect(modal().text()).toContain('could not be reached')
      expect(component.find('tbody').text().match(/Yes/g)).toHaveLength(1) // still only "read"
    })

    it('does not add a grant the server refused: the dialog stays open with the reason and the table is unchanged', async () => {
      mockListCollections.mockResolvedValue(['users', 'orders'])
      const component = await mountRole([usersGrant])
      mockUpdateRole.mockRejectedValueOnce(fetchError)

      await component.findAll('button').find(b => b.text() === 'Add Grant')?.trigger('click')
      await wait()
      const select = component.findComponent(USelectMenu)
      select.vm.$emit('update:modelValue', 'orders')
      await wait()
      await modal().find('form').trigger('submit')
      await flushPromises()

      expect(mockUpdateRole).toHaveBeenCalled() // the form did submit
      expect(modal().text()).toContain('could not be reached')
      expect(component.find('tbody').text()).not.toContain('orders')
    })

    it('saves again from the last state the server confirmed after a refusal', async () => {
      const component = await mountRole()
      mockUpdateRole.mockRejectedValueOnce(fetchError)
      await component.findAll('[aria-label="Remove grant"]')[0]!.trigger('click')
      await flushPromises()

      await component.findAll('[aria-label="Remove grant"]')[1]!.trigger('click') // remove "orders" instead
      await flushPromises()

      // the failed removal of "users" must not leak into this save
      expect(mockUpdateRole).toHaveBeenLastCalledWith('support', false, [expect.objectContaining({ name: 'users' })])
    })
  })

  describe('add all read-only', () => {
    const usersGrant = { name: 'users', read: true, write: true, administrate: false, grantType: 'COLLECTION' }

    async function mountRole() {
      mockListRoles.mockResolvedValue([{ name: 'support', isAdmin: false, collectionGrants: [{ ...usersGrant }] }])
      const component = await mountSuspended(withUApp(MongocampRoleGrants), { route: '/', props: { roleName: 'support' } })
      await flushPromises()
      return component
    }

    const addAllButton = (component: Awaited<ReturnType<typeof mountRole>>) =>
      component.findAll('button').find(b => b.text() === 'Add all read-only')!

    it('grants read-only access to collections without a grant, skipping mc_ collections and keeping existing grants', async () => {
      mockListCollections.mockResolvedValue(['users', 'orders', 'mc_users', 'mc_jobs', 'items'])
      const component = await mountRole()

      await addAllButton(component).trigger('click')
      await flushPromises()

      expect(mockUpdateRole).toHaveBeenCalledWith('support', false, [
        usersGrant,
        { name: 'orders', read: true, write: false, administrate: false, grantType: 'COLLECTION' },
        { name: 'items', read: true, write: false, administrate: false, grantType: 'COLLECTION' },
      ])
    })

    it('is disabled when only granted and mc_ collections are left', async () => {
      mockListCollections.mockResolvedValue(['users', 'mc_users'])
      const component = await mountRole()

      expect(addAllButton(component).attributes('disabled')).toBeDefined()
    })
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
