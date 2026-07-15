import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
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
