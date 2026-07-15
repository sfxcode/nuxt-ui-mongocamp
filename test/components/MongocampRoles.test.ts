import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampRoles from '../../src/runtime/components/MongocampRoles.vue'

// UModal's close transition is timer-based, so a stale modal from a previous test can still
// be in document.body (which modal() queries globally) when the next test starts — force an
// immediate unmount between tests instead of waiting out the animation.
enableAutoUnmount(afterEach)

// UModal's open transition is timer-based (Reka UI's Presence/animation handling), so
// flushPromises() (microtasks only) isn't enough to observe the modal's contents right after
// triggering the button that opens it — a real timer tick is needed too.
function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// UModal renders its content through a real <Teleport to="body">, which moves the DOM node
// out of the mounted wrapper's own root element — component.find(...) only searches within
// that root, so it can never see modal content. Query document.body directly instead.
function modal() {
  return new DOMWrapper(document.body)
}

// Nuxt UI's UTooltip (and other portal-based components) need a UApp provider context,
// normally supplied by the consuming app's root app.vue — mounting a component in isolation
// without it throws "Injection Symbol(TooltipProviderContext) not found". Wrapping every
// mount in UApp here is the fix; carried forward into every later phase's test file.
// resolveComponent('UApp') does NOT work here — UApp isn't registered with `global: true`,
// so runtime resolution only succeeds for components a real Nuxt-compiled SFC already has an
// auto-injected import for. '#components' is Nuxt's virtual module exporting every
// auto-importable component as a real named export, which works from plain hand-written code.
function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

const mockListRoles = vi.fn()
const mockAddRole = vi.fn()
const mockUpdateRole = vi.fn()
const mockDeleteRole = vi.fn()

// Mocking the mechanism proven in phase 2 (04-component-test-coverage): MongocampRoles.vue
// imports useMongocampAdmin via a relative path, not a Nuxt auto-import — so mockNuxtImport
// (which only intercepts unimport-resolved auto-imports) does not apply here. A plain
// vi.mock targeting the exact module path the component itself imports works instead, and is
// resolved by module identity, so it works the same whether or not a real Nuxt app is booted.
vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({
    listRoles: mockListRoles,
    addRole: mockAddRole,
    updateRole: mockUpdateRole,
    deleteRole: mockDeleteRole,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockListRoles.mockResolvedValue([])
})

describe('MongocampRoles', () => {
  it('fetches roles on mount and renders them from the mocked composable, not a real network call', async () => {
    mockListRoles.mockResolvedValueOnce([
      { name: 'admin', isAdmin: true, collectionGrants: [] },
      { name: 'support', isAdmin: false, collectionGrants: [{ name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }] },
    ])

    const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })

    expect(mockListRoles).toHaveBeenCalledWith('')
    expect(component.text()).toContain('admin')
    expect(component.text()).toContain('support')
  })

  it('adds a role: submitting the add form calls addRole and refetches', async () => {
    const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })

    const openAddButton = component.findAll('button').find(b => b.text() === 'Add Role')
    await openAddButton?.trigger('click')
    await wait()

    await modal().find('#input_0').setValue('editor')
    await wait() // FormKit debounces validation — the submit button stays disabled until it settles
    await modal().find('button[type="submit"]').trigger('click')
    await flushPromises()

    expect(mockAddRole).toHaveBeenCalledWith('editor', false)
    expect(mockListRoles).toHaveBeenCalledTimes(2)
  })

  it('edits a role: opening edit pre-fills the form, submitting calls updateRole with the existing grants', async () => {
    mockListRoles.mockResolvedValueOnce([
      { name: 'support', isAdmin: false, collectionGrants: [{ name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' }] },
    ])
    const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })

    await component.find('[aria-label="Edit role"]').trigger('click')
    await wait()
    expect(modal().text()).toContain('Edit Role: support')

    await modal().find('button[type="submit"]').trigger('click')
    await flushPromises()

    expect(mockUpdateRole).toHaveBeenCalledWith('support', false, [
      { name: 'users', read: true, write: false, administrate: false, grantType: 'COLLECTION' },
    ])
  })

  it('deletes a role: confirming the modal calls deleteRole with the role name', async () => {
    mockListRoles.mockResolvedValueOnce([{ name: 'support', isAdmin: false, collectionGrants: [] }])
    const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })

    await component.find('[aria-label="Delete role"]').trigger('click')
    await wait()
    expect(modal().text()).toContain('Are you sure you want to delete role')

    const confirmButton = modal().findAll('button').find(b => b.text() === 'Delete')
    await confirmButton?.trigger('click')
    await flushPromises()

    expect(mockDeleteRole).toHaveBeenCalledWith('support')
  })

  describe('grantsPath', () => {
    it('defaults the "Manage grants" link to /secured/admin/roles/<name>', async () => {
      mockListRoles.mockResolvedValueOnce([{ name: 'support', isAdmin: false, collectionGrants: [] }])
      const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })

      const link = component.find('[aria-label="Manage grants"]')
      expect(link.attributes('href')).toBe('/secured/admin/roles/support')
    })

    it('uses the grantsPath prop when provided', async () => {
      mockListRoles.mockResolvedValueOnce([{ name: 'support', isAdmin: false, collectionGrants: [] }])
      const component = await mountSuspended(withUApp(MongocampRoles), {
        route: '/',
        props: { grantsPath: '/custom/grants' },
      })

      const link = component.find('[aria-label="Manage grants"]')
      expect(link.attributes('href')).toBe('/custom/grants/support')
    })
  })
})
