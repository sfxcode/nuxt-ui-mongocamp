import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockOptions: Record<string, unknown> = {}
let mockMongocamp: Record<string, unknown> = {}
let mockSession: { token?: string } | null = null
const mockLogout = vi.fn()

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions, mongocamp: mockMongocamp } }),
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

// the probe keeps module-level state (single flight + cooldown), so every test gets a fresh module
async function loadComposable() {
  vi.resetModules()
  const module = await import('../src/runtime/composables/useMongocampSession')
  return module.useMongocampSession()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOptions = {}
  mockMongocamp = { url: 'https://mc.example.com' }
  mockSession = { token: tokenExpiringIn(3600) }
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
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

describe('diagnoseFailure (after a request failed with a network error)', () => {
  it('is expired without asking the server when the token has run out', async () => {
    mockSession = { token: tokenExpiringIn(-3600) }

    expect(await (await loadComposable()).diagnoseFailure()).toBe('expired')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is rejected when the server answers while our calls fail', async () => {
    expect(await (await loadComposable()).diagnoseFailure()).toBe('rejected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is unknown — not a dead session — when the server cannot be reached either', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await (await loadComposable()).diagnoseFailure()).toBe('unknown')
  })

  it('is unknown when there is no token to blame', async () => {
    mockSession = null
    // a missing token with a reachable server is not a "rejected" session: nobody was logged in
    expect(await (await loadComposable()).diagnoseFailure()).toBe('unknown')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers a burst of failures with one probe', async () => {
    const session = await loadComposable()

    await Promise.all([session.diagnoseFailure(), session.diagnoseFailure(), session.diagnoseFailure()])
    await session.diagnoseFailure()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is unknown when no MongoCamp URL is configured to ask', async () => {
    mockMongocamp = {}

    expect(await (await loadComposable()).diagnoseFailure()).toBe('unknown')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('probes without credentials', async () => {
    await (await loadComposable()).diagnoseFailure()

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.credentials).toBe('omit')
    expect(init.headers).toBeUndefined()
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
    expect(await session.diagnoseFailure()).toBe('unknown')
  })

  it('sends no request and does not log out', async () => {
    const session = await loadComposable()

    await session.diagnoseFailure()
    await session.invalidateSession()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
