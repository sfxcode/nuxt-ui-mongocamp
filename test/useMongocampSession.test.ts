import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockOptions: Record<string, unknown> = {}
let mockSession: { token?: string } | null = null
const mockLogout = vi.fn()
const mockIsAuthenticated = vi.fn()

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

vi.mock('#imports', () => ({
  useMongocampAuth: () => ({ logout: mockLogout }),
  useMongocampClientApi: () => ({ authApi: { isAuthenticated: mockIsAuthenticated } }),
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

describe('verify', () => {
  it('is valid when the server answers true, with a timeout signal', async () => {
    mockIsAuthenticated.mockResolvedValueOnce({ value: true })

    expect(await (await loadComposable()).verify()).toBe('valid')
    expect(mockIsAuthenticated).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('is invalid for an explicit false and for a readable 401', async () => {
    mockIsAuthenticated.mockResolvedValueOnce({ value: false })
    expect(await (await loadComposable()).verify()).toBe('invalid')

    mockIsAuthenticated.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { name: 'ResponseError', response: { status: 401 } }))
    expect(await (await loadComposable()).verify()).toBe('invalid')
  })

  it.each([
    ['a network failure', Object.assign(new Error('offline'), { name: 'FetchError' })],
    ['a 500', Object.assign(new Error('boom'), { name: 'ResponseError', response: { status: 500 } })],
    ['a timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
  ])('is unknown after %s — never a reason to log anyone out', async (_label, error) => {
    mockIsAuthenticated.mockRejectedValueOnce(error)

    expect(await (await loadComposable()).verify()).toBe('unknown')
  })

  it('is unknown for an unexpected answer, and asks nothing without a token', async () => {
    mockIsAuthenticated.mockResolvedValueOnce({})
    expect(await (await loadComposable()).verify()).toBe('unknown')

    mockIsAuthenticated.mockClear()
    mockSession = {}
    expect(await (await loadComposable()).verify()).toBe('unknown')
    expect(mockIsAuthenticated).not.toHaveBeenCalled()
  })

  it('is unknown without a request in server proxy mode', async () => {
    mockOptions = { useServerProxy: true }

    expect(await (await loadComposable()).verify()).toBe('unknown')
    expect(mockIsAuthenticated).not.toHaveBeenCalled()
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
