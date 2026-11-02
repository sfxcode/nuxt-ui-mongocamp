import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockOptions: Record<string, unknown> = {}
let mockSession: { token?: string } | null = null
const mockLogout = vi.fn()

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

vi.mock('#imports', () => ({
  useMongocampAuth: () => ({ logout: mockLogout }),
  useMongocampStorage: () => ({ get value() { return mockSession } }),
}))

function b64url(value: string): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function tokenExpiringIn(seconds: number): string {
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.sig`
}

const fetchMock = vi.fn()

async function loadComposable() {
  vi.resetModules()
  const module = await import('../src/runtime/composables/useMongocampSession')
  return module.useMongocampSession()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOptions = {}
  mockSession = { token: tokenExpiringIn(3600) }
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkExpiry', () => {
  it('reports valid for a token that has not run out', async () => {
    expect((await loadComposable()).checkExpiry()).toBe('valid')
  })

  it('reports expired for a token past its exp', async () => {
    mockSession = { token: tokenExpiringIn(-3600) }
    expect((await loadComposable()).checkExpiry()).toBe('expired')
  })

  it('never reports expired for a token it cannot read, or for no token at all', async () => {
    mockSession = { token: 'garbage' }
    expect((await loadComposable()).checkExpiry()).toBe('unknown')
    mockSession = {}
    expect((await loadComposable()).checkExpiry()).toBe('unknown')
    mockSession = null
    expect((await loadComposable()).checkExpiry()).toBe('unknown')
  })
})

describe('currentState (no request)', () => {
  it('maps the expiry check to a session state', async () => {
    expect((await loadComposable()).currentState()).toBe('active')
    mockSession = { token: tokenExpiringIn(-3600) }
    expect((await loadComposable()).currentState()).toBe('expired')
    mockSession = { token: 'garbage' }
    expect((await loadComposable()).currentState()).toBe('unknown')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('invalidateSession', () => {
  it('awaits the dependency\'s logout', async () => {
    let finished = false
    mockLogout.mockImplementation(() => new Promise<void>((resolve) => {
      setTimeout(() => {
        finished = true
        resolve()
      }, 10)
    }))

    await (await loadComposable()).invalidateSession()

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(finished).toBe(true)
  })
})

describe('server proxy mode (no login, no token)', () => {
  beforeEach(() => {
    mockOptions = { useServerProxy: true }
    mockSession = { token: tokenExpiringIn(-3600) }
  })

  it('never reports a session problem', async () => {
    const session = await loadComposable()

    expect(session.checkExpiry()).toBe('unknown')
    expect(session.currentState()).toBe('unknown')
  })

  it('does not log out', async () => {
    const session = await loadComposable()

    await session.invalidateSession()

    expect(mockLogout).not.toHaveBeenCalled()
  })
})
