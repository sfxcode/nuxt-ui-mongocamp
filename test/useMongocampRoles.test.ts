import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const mockIsLoggedIn = ref(false)
const mockState = ref<{ profile: { isAdmin: boolean, roles: string[] } }>({ profile: { isAdmin: false, roles: [] } })
let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

vi.mock('#imports', () => ({
  useMongocampAuth: () => ({ isLoggedIn: mockIsLoggedIn }),
  useMongocampStorage: () => mockState,
}))

// must come after vi.mock — a static top-level import would resolve before the mocks are wired up
const { useMongocampRoles } = await import('../src/runtime/composables/useMongocampRoles')

beforeEach(() => {
  mockIsLoggedIn.value = false
  mockState.value = { profile: { isAdmin: false, roles: [] } }
  mockOptions = {
    notAllowedPath: '/',
    managerRoles: [],
    securedRouteParts: [],
    managementRouteParts: [],
    adminRouteParts: [],
  }
})

describe('notAllowedPath', () => {
  it('defaults to \'/\'', () => {
    const { notAllowedPath } = useMongocampRoles()
    expect(notAllowedPath).toBe('/')
  })

  it('reflects the configured value', () => {
    mockOptions.notAllowedPath = '/login'
    const { notAllowedPath } = useMongocampRoles()
    expect(notAllowedPath).toBe('/login')
  })
})

describe('isLoggedIn', () => {
  it('passes through useMongocampAuth\'s isLoggedIn ref', () => {
    mockIsLoggedIn.value = true
    const { isLoggedIn } = useMongocampRoles()
    expect(isLoggedIn.value).toBe(true)
  })
})

describe('isAdmin', () => {
  it('reflects the stored profile\'s isAdmin flag', () => {
    mockState.value = { profile: { isAdmin: true, roles: [] } }
    const { isAdmin } = useMongocampRoles()
    expect(isAdmin.value).toBe(true)
  })

  it('defaults to false when the profile is missing', () => {
    mockState.value = { profile: undefined as unknown as { isAdmin: boolean, roles: string[] } }
    const { isAdmin } = useMongocampRoles()
    expect(isAdmin.value).toBe(false)
  })
})

describe('isManager', () => {
  it('is true when the profile has a role listed in managerRoles', () => {
    mockOptions.managerRoles = ['editor', 'support']
    mockState.value = { profile: { isAdmin: false, roles: ['support'] } }
    const { isManager } = useMongocampRoles()
    expect(isManager.value).toBe(true)
  })

  it('is false when no profile role matches managerRoles', () => {
    mockOptions.managerRoles = ['editor', 'support']
    mockState.value = { profile: { isAdmin: false, roles: ['viewer'] } }
    const { isManager } = useMongocampRoles()
    expect(isManager.value).toBe(false)
  })

  it('is true for an admin even when managerRoles is empty or unmatched', () => {
    mockState.value = { profile: { isAdmin: true, roles: [] } }
    const { isManager } = useMongocampRoles()
    expect(isManager.value).toBe(true)
  })
})

describe('isAllowedPathForRoute', () => {
  it('allows any route when no route parts are configured', () => {
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/admin/users')).toBe(true)
  })

  it('blocks a secured route when not logged in', () => {
    mockOptions.securedRouteParts = ['/secured/**']
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/account')).toBe(false)
  })

  it('allows a secured route once logged in', () => {
    mockOptions.securedRouteParts = ['/secured/**']
    mockIsLoggedIn.value = true
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/account')).toBe(true)
  })

  it('blocks the bare directory route itself (no trailing slash), not just its nested pages', () => {
    // minimatch's `**` requires at least one more path segment after the trailing `/`,
    // so `/secured/**` alone would not match `/secured` (the directory's own index route)
    mockOptions.securedRouteParts = ['/secured/**']
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured')).toBe(false)
  })

  it('allows the bare directory route once logged in', () => {
    mockOptions.securedRouteParts = ['/secured/**']
    mockIsLoggedIn.value = true
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured')).toBe(true)
  })

  it('blocks a management route for a logged-in non-manager', () => {
    mockOptions.managementRouteParts = ['/secured/manage/**']
    mockIsLoggedIn.value = true
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/manage/reports')).toBe(false)
  })

  it('allows a management route for a manager', () => {
    mockOptions.managementRouteParts = ['/secured/manage/**']
    mockOptions.managerRoles = ['support']
    mockIsLoggedIn.value = true
    mockState.value = { profile: { isAdmin: false, roles: ['support'] } }
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/manage/reports')).toBe(true)
  })

  it('blocks an admin route for a logged-in non-admin', () => {
    mockOptions.adminRouteParts = ['/secured/admin/**']
    mockIsLoggedIn.value = true
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/admin/users')).toBe(false)
  })

  it('allows an admin route for an admin', () => {
    mockOptions.adminRouteParts = ['/secured/admin/**']
    mockIsLoggedIn.value = true
    mockState.value = { profile: { isAdmin: true, roles: [] } }
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/admin/users')).toBe(true)
  })

  it('blocks an admin route for a not-logged-in user via the secured check first', () => {
    mockOptions.securedRouteParts = ['/secured/**']
    mockOptions.adminRouteParts = ['/secured/admin/**']
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/admin/users')).toBe(false)
  })

  it('allows an unrelated public route regardless of login state', () => {
    mockOptions.securedRouteParts = ['/secured/**']
    mockOptions.adminRouteParts = ['/secured/admin/**']
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/')).toBe(true)
  })

  it('always allows notAllowedPath, even when it also matches a secured/admin pattern', () => {
    // proves the middleware's own redirect target can never itself trigger another redirect
    mockOptions.notAllowedPath = '/secured/admin/login'
    mockOptions.securedRouteParts = ['/secured/**']
    mockOptions.adminRouteParts = ['/secured/admin/**']
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/secured/admin/login')).toBe(true)
  })

  it('allows the default notAllowedPath (\'/\') even when securedRouteParts covers every route', () => {
    // securedRouteParts: ['/**'] is the most restrictive possible config — everything is
    // secured, including '/' itself — yet the default redirect target must stay reachable
    mockOptions.securedRouteParts = ['/**']
    const { isAllowedPathForRoute } = useMongocampRoles()
    expect(isAllowedPathForRoute('/')).toBe(true)
  })
})
