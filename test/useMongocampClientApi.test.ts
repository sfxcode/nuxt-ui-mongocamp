import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSessionApi = { documentApi: 'session' }
const mockProxyApi = { documentApi: 'proxy' }
let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

vi.mock('#imports', () => ({
  useMongocampApi: () => mockSessionApi,
}))

vi.mock('../src/runtime/composables/useMongocampProxyApi', () => ({
  useMongocampProxyApi: () => mockProxyApi,
}))

// must come after vi.mock — a static top-level import would resolve before the mocks are wired up
const { useMongocampClientApi } = await import('../src/runtime/composables/useMongocampClientApi')

beforeEach(() => {
  mockOptions = {}
})

describe('useMongocampClientApi', () => {
  it('returns the session-mode client when useServerProxy is false (the default)', () => {
    mockOptions = { useServerProxy: false }
    expect(useMongocampClientApi()).toBe(mockSessionApi)
  })

  it('returns the session-mode client when useServerProxy is not configured at all', () => {
    expect(useMongocampClientApi()).toBe(mockSessionApi)
  })

  it('returns the proxy-mode client when useServerProxy is true', () => {
    mockOptions = { useServerProxy: true }
    expect(useMongocampClientApi()).toBe(mockProxyApi)
  })
})
