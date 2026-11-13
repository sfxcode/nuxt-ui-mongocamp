import { describe, expect, it, vi } from 'vitest'

let mockPublic: Record<string, unknown> = {}
vi.mock('#app', () => ({ useRuntimeConfig: () => ({ public: mockPublic }) }))

const { useMongocampProxyMode } = await import('../src/runtime/composables/useMongocampProxyMode')

describe('useMongocampProxyMode', () => {
  it('is false without the option, and without any module options at all', () => {
    mockPublic = { nuxtUiMongocampOptions: {} }
    expect(useMongocampProxyMode()).toBe(false)
    mockPublic = {}
    expect(useMongocampProxyMode()).toBe(false)
  })

  it('is true when useServerProxy is on', () => {
    mockPublic = { nuxtUiMongocampOptions: { useServerProxy: true } }
    expect(useMongocampProxyMode()).toBe(true)
  })
})
