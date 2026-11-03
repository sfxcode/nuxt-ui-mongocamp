import { describe, it, expect, beforeEach, vi } from 'vitest'
import { permissionDeniedMiddleware } from '../src/runtime/utils/permissionDenied'

let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }),
}))

// must come after vi.mock — a static top-level import would resolve before the mock is wired up
const { useMongocampProxyApi } = await import('../src/runtime/composables/useMongocampProxyApi')

const API_NAMES = [
  'adminApi',
  'applicationApi',
  'authApi',
  'bucketApi',
  'collectionApi',
  'databaseApi',
  'documentApi',
  'fileApi',
  'indexApi',
  'systemApi',
  'jobApi',
] as const

// The generated API classes declare `configuration` as `protected` in their `.d.ts`, even
// though it's a plain public JS field at runtime (`this.configuration = configuration`) — see
// [[project/mongocamp-server-types]]. Reached through `unknown` rather than `any` for the test.
interface ApiWithConfiguration {
  configuration?: { basePath?: string, accessToken?: unknown, apiKey?: unknown }
}

beforeEach(() => {
  mockOptions = { serverProxyPath: '/api/_mongocamp-test' }
})

describe('useMongocampProxyApi', () => {
  it('builds every API instance pointed at the configured serverProxyPath, with no token or api key', () => {
    const apis = useMongocampProxyApi()

    for (const name of API_NAMES) {
      const api = apis[name] as unknown as ApiWithConfiguration
      expect(api.configuration?.basePath).toBe('/api/_mongocamp-test')
      expect(api.configuration?.accessToken).toBeUndefined()
      expect(api.configuration?.apiKey).toBeUndefined()
    }
  })

  it('turns a missing-grant 401 into a 403 on every instance (the api key may have limited grants too)', () => {
    const apis = useMongocampProxyApi()

    for (const name of API_NAMES) {
      const api = apis[name] as unknown as { middleware: unknown[] }
      expect(api.middleware).toContain(permissionDeniedMiddleware)
    }
  })

  it('falls back to /api/_mongocamp when serverProxyPath is not configured', () => {
    mockOptions = {}
    const apis = useMongocampProxyApi()
    const api = apis.documentApi as unknown as ApiWithConfiguration
    expect(api.configuration?.basePath).toBe('/api/_mongocamp')
  })
})
