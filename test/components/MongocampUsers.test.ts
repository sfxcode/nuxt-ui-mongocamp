import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampUsers from '../../src/runtime/components/MongocampUsers.vue'

// UModal's close transition is timer-based, so a stale modal from a previous test can still
// leak into document.body (see MongocampCollectionData.test.ts for where this was caught) —
// force an immediate unmount between tests instead of waiting out the animation.
enableAutoUnmount(afterEach)

// See test/components/MongocampRoles.test.ts for why each of these helpers is needed
// (UApp provider context, FormKit validation debounce, UModal's teleport-to-body rendering).
function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function modal() {
  return new DOMWrapper(document.body)
}

// nuxtUIListbox's transfer mode renders four move buttons (single/all, each direction) as
// plain <button>s with no aria-label, distinguished only by their icon. `transferAll: true`
// (set on both schemas in MongocampUsers.vue) is what makes the "move all" buttons available —
// clicking it is the simplest deterministic way to drive this dual-pane widget in a test,
// versus simulating a drag-and-drop of an individual item.
function transferAllRightButton(scope: DOMWrapper<Element>) {
  return scope.findAll('button').find(b => b.html().includes('chevrons-right'))
}

// FormKit's input ids (input_0, input_1, ...) are assigned from a counter that isn't reset
// per mountSuspended call within a test file, so a hardcoded "#input_0" only reliably means
// "the form's first field" for the very first form mounted in the whole file. Finding by the
// field's own label text is robust regardless of how many forms mounted before it.
function findInputByLabel(scope: DOMWrapper<Element>, labelText: string) {
  const label = scope.findAll('label').find(l => l.text() === labelText)
  const id = label?.attributes('for')
  if (!id) throw new Error(`No label found with text "${labelText}"`)
  return scope.find(`#${id}`)
}

const mockListUsers = vi.fn()
const mockAddUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockUpdateUserRoles = vi.fn()
const mockUpdateUserPassword = vi.fn()
const mockListRoles = vi.fn()

// Mocking mechanism proven in phase 2 (04-component-test-coverage) — see MongocampRoles.test.ts.
vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({
    listUsers: mockListUsers,
    addUser: mockAddUser,
    deleteUser: mockDeleteUser,
    updateUserRoles: mockUpdateUserRoles,
    updateUserPassword: mockUpdateUserPassword,
    listRoles: mockListRoles,
  }),
}))

// the signed-in user — bulk delete must not let them select their own row
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'alice@example.com' } } }))

beforeEach(() => {
  vi.clearAllMocks()
  mockListUsers.mockResolvedValue([])
  mockListRoles.mockResolvedValue([])
})

describe('MongocampUsers', () => {
  it('fetches users and roles on mount and renders users from the mocked composable', async () => {
    mockListUsers.mockResolvedValueOnce([
      { user: 'alice@example.com', isAdmin: true, roles: [] },
      { user: 'bob@example.com', isAdmin: false, roles: ['support'] },
    ])

    const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })

    expect(mockListUsers).toHaveBeenCalledWith('')
    expect(mockListRoles).toHaveBeenCalledWith()
    expect(component.text()).toContain('alice@example.com')
    expect(component.text()).toContain('bob@example.com')
  })

  describe('bulk delete', () => {
    const users = [
      { user: 'alice@example.com', isAdmin: true, roles: [] },
      { user: 'bob@example.com', isAdmin: false, roles: [] },
      { user: 'carol@example.com', isAdmin: false, roles: [] },
    ]

    async function selectBobAndCarol() {
      mockListUsers.mockResolvedValue(users)
      const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })
      await flushPromises()
      const boxes = component.findAll('[aria-label="Select row"]')
      await boxes[1]!.trigger('click')
      await boxes[2]!.trigger('click')
      return component
    }

    it('does not let the signed-in user select their own row', async () => {
      mockListUsers.mockResolvedValue(users)
      const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })
      await flushPromises()

      const boxes = component.findAll('[aria-label="Select row"]')
      expect(boxes[0]!.attributes('disabled')).toBeDefined()
      expect(boxes[1]!.attributes('disabled')).toBeUndefined()
    })

    it('select-all skips the signed-in user too, so a bulk delete can never include them', async () => {
      mockListUsers.mockResolvedValue(users)
      const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })
      await flushPromises()

      await component.find('[aria-label="Select all rows on this page"]').trigger('click')
      expect(component.text()).toContain('2 selected')

      await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
      await flushPromises()

      expect(mockDeleteUser.mock.calls.map(c => c[0]).sort()).toEqual(['bob@example.com', 'carol@example.com'])
    })

    it('shows how many rows are selected and deletes exactly those after confirming, then reloads', async () => {
      const component = await selectBobAndCarol()
      expect(component.text()).toContain('2 selected')

      await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
      await wait()
      expect(mockDeleteUser).not.toHaveBeenCalled() // nothing is deleted before confirming
      expect(modal().text()).toContain('bob@example.com')

      await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
      await flushPromises()

      expect(mockDeleteUser.mock.calls.map(c => c[0]).sort()).toEqual(['bob@example.com', 'carol@example.com'])
      expect(mockListUsers).toHaveBeenCalledTimes(2)
      expect(component.text()).not.toContain('selected')
    })

    it('on a partial failure keeps the failed user selected and says what went wrong', async () => {
      mockDeleteUser.mockImplementation(async (id: string) => {
        if (id === 'carol@example.com') throw new Error('forbidden')
      })
      const component = await selectBobAndCarol()

      await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
      await flushPromises()

      expect(modal().text()).toContain('1 of 2 could not be deleted: forbidden')
      expect(component.text()).toContain('1 selected')
    })

    it('drops the selection when the list is reloaded, so hidden rows can never be deleted', async () => {
      const component = await selectBobAndCarol()
      expect(component.text()).toContain('2 selected')

      await component.find('[aria-label="Refresh"]').trigger('click')
      await flushPromises()

      expect(component.text()).not.toContain('selected')
    })
  })

  it('adds a user: fills the form, transfers a role across, and submits', async () => {
    mockListRoles.mockResolvedValueOnce([{ name: 'admin', isAdmin: true }, { name: 'support', isAdmin: false }])
    const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })

    const openAddButton = component.findAll('button').find(b => b.text() === 'Add User')
    await openAddButton?.trigger('click')
    await wait()

    await findInputByLabel(modal(), 'Email').setValue('new@example.com')
    await findInputByLabel(modal(), 'Password').setValue('secret')
    await transferAllRightButton(modal())?.trigger('click')
    await wait()

    await modal().find('button[type="submit"]').trigger('click')
    await flushPromises()

    expect(mockAddUser).toHaveBeenCalledWith('new@example.com', 'secret', '', ['admin', 'support'])
    expect(mockListUsers).toHaveBeenCalledTimes(2)
  })

  it('edits a user: opening edit pre-fills roles, submitting updates roles (and password only if provided)', async () => {
    mockListUsers.mockResolvedValueOnce([{ user: 'bob@example.com', isAdmin: false, roles: ['support'] }])
    mockListRoles.mockResolvedValueOnce([{ name: 'admin', isAdmin: true }, { name: 'support', isAdmin: false }])
    const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })

    await component.find('[aria-label="Edit user"]').trigger('click')
    await wait()
    expect(modal().text()).toContain('Edit User: bob@example.com')

    await modal().find('button[type="submit"]').trigger('click')
    await flushPromises()

    expect(mockUpdateUserRoles).toHaveBeenCalledWith('bob@example.com', ['support'])
    expect(mockUpdateUserPassword).not.toHaveBeenCalled()
  })

  it('edits a user: providing a new password also calls updateUserPassword', async () => {
    mockListUsers.mockResolvedValueOnce([{ user: 'bob@example.com', isAdmin: false, roles: [] }])
    const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })

    await component.find('[aria-label="Edit user"]').trigger('click')
    await wait()

    await findInputByLabel(modal(), 'New Password').setValue('newpass')
    await wait()
    await modal().find('button[type="submit"]').trigger('click')
    await flushPromises()

    expect(mockUpdateUserPassword).toHaveBeenCalledWith('bob@example.com', 'newpass')
  })

  it('deletes a user: confirming the modal calls deleteUser with the user id', async () => {
    mockListUsers.mockResolvedValueOnce([{ user: 'bob@example.com', isAdmin: false, roles: [] }])
    const component = await mountSuspended(withUApp(MongocampUsers), { route: '/' })

    await component.find('[aria-label="Delete user"]').trigger('click')
    await wait()
    expect(modal().text()).toContain('Are you sure you want to delete user')

    const confirmButton = modal().findAll('button').find(b => b.text() === 'Delete')
    await confirmButton?.trigger('click')
    await flushPromises()

    expect(mockDeleteUser).toHaveBeenCalledWith('bob@example.com')
  })
})
