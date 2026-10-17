import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useNuxtApp } from '#app'
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

  it('shows an error alert (not a bare empty table) when loading fails, and retry refetches', async () => {
    mockListRoles.mockRejectedValueOnce(Object.assign(new Error('The request failed'), { name: 'FetchError' }))

    const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })
    await flushPromises()

    expect(component.text()).toContain('Failed to load data')
    expect(component.text()).not.toContain('The request failed')

    await component.findAll('button').find(b => b.text() === 'Retry')?.trigger('click')
    await flushPromises()
    expect(mockListRoles).toHaveBeenCalledTimes(2)
    expect(component.text()).not.toContain('Failed to load data')
  })

  it('re-translates column headers when the locale changes, without remounting', async () => {
    mockListRoles.mockResolvedValueOnce([{ name: 'admin', isAdmin: true, collectionGrants: [] }])
    const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })
    await flushPromises()
    expect(component.findAll('th').map(th => th.text())).toContain('Grants')

    const { $i18n } = useNuxtApp()
    await $i18n.setLocale('de')
    await flushPromises()
    try {
      expect(component.findAll('th').map(th => th.text())).toContain('Berechtigungen')
    }
    finally {
      await $i18n.setLocale('en')
    }
  })

  describe('single-row delete', () => {
    const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })

    async function openDelete() {
      mockListRoles.mockResolvedValue([{ name: 'support', isAdmin: false, collectionGrants: [] }])
      const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })
      await flushPromises()
      await component.find('[aria-label="Delete role"]').trigger('click')
      await wait()
      return component
    }

    const confirm = () => modal().findAll('button').find(b => b.text() === 'Delete')

    it('deletes after confirming, then reloads', async () => {
      await openDelete()
      expect(mockDeleteRole).not.toHaveBeenCalled()

      await confirm()?.trigger('click')
      await flushPromises()

      expect(mockDeleteRole).toHaveBeenCalledWith('support')
      expect(mockListRoles).toHaveBeenCalledTimes(2)
    })

    it('keeps the dialog open and says why when the server refuses, instead of failing silently', async () => {
      await openDelete()
      mockDeleteRole.mockRejectedValueOnce(fetchError)

      await confirm()?.trigger('click')
      await flushPromises()

      expect(modal().text()).toContain('Delete Role')
      expect(modal().text()).toContain('could not be reached')
      expect(mockListRoles).toHaveBeenCalledTimes(1) // nothing was deleted, so nothing is reloaded
    })

    it('lets the user try again after a refusal', async () => {
      await openDelete()
      mockDeleteRole.mockRejectedValueOnce(fetchError)
      await confirm()?.trigger('click')
      await flushPromises()
      expect(modal().text()).toContain('could not be reached')

      await confirm()?.trigger('click')
      await flushPromises()

      expect(mockDeleteRole).toHaveBeenCalledTimes(2)
      expect(mockListRoles).toHaveBeenCalledTimes(2)
      expect(modal().text()).not.toContain('could not be reached')
    })

    it('shows a permission message for a 403 and clears a stale error when reopened', async () => {
      const component = await openDelete()
      mockDeleteRole.mockRejectedValueOnce({ name: 'ResponseError', response: { status: 403 } })
      await confirm()?.trigger('click')
      await flushPromises()
      expect(modal().text()).toContain('You do not have permission to do this.')

      await modal().findAll('button').find(b => b.text() === 'Cancel')?.trigger('click')
      await wait(400)
      await component.find('[aria-label="Delete role"]').trigger('click')
      await wait()

      expect(modal().text()).not.toContain('You do not have permission')
    })
  })

  describe('bulk delete', () => {
    async function selectSupportAndSales() {
      mockListRoles.mockResolvedValue([
        { name: 'admin', isAdmin: true, collectionGrants: [] },
        { name: 'support', isAdmin: false, collectionGrants: [] },
        { name: 'sales', isAdmin: false, collectionGrants: [] },
      ])
      const component = await mountSuspended(withUApp(MongocampRoles), { route: '/' })
      await flushPromises()
      const boxes = component.findAll('[aria-label="Select row"]')
      await boxes[1]!.trigger('click')
      await boxes[2]!.trigger('click')
      return component
    }

    it('deletes exactly the selected roles after confirming, then reloads', async () => {
      const component = await selectSupportAndSales()
      expect(component.text()).toContain('2 selected')

      await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
      await wait()
      expect(mockDeleteRole).not.toHaveBeenCalled()

      await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
      await flushPromises()

      expect(mockDeleteRole.mock.calls.map(c => c[0]).sort()).toEqual(['sales', 'support'])
      expect(mockListRoles).toHaveBeenCalledTimes(2)
      expect(component.text()).not.toContain('selected')
    })

    it('on a partial failure keeps the failed role selected and says what went wrong', async () => {
      mockDeleteRole.mockImplementation(async (name: string) => {
        if (name === 'sales') throw new Error('role is in use')
      })
      const component = await selectSupportAndSales()

      await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
      await flushPromises()

      expect(modal().text()).toContain('1 of 2 could not be deleted: role is in use')
      expect(component.text()).toContain('1 selected')
    })
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
