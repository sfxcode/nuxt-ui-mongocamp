import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

type Profile = { isAdmin?: boolean } | undefined
const mockState = ref<{ profile?: Profile }>({})
let mockOptions: Record<string, unknown> = {}

vi.mock('#app', () => ({ useRuntimeConfig: () => ({ public: { nuxtUiMongocampOptions: mockOptions } }) }))
vi.mock('#imports', () => ({
  useMongocampStorage: () => mockState,
  useI18n: () => ({ t: (key: string) => key }),
}))

const { useMongocampAdminGate } = await import('../src/runtime/composables/useMongocampAdminGate')

beforeEach(() => {
  mockOptions = {}
  mockState.value = {}
})

describe('useMongocampAdminGate', () => {
  it('blocks a user who is known not to be an administrator and says so', () => {
    mockState.value = { profile: { isAdmin: false } }
    const { blocked, message } = useMongocampAdminGate()

    expect(blocked.value).toBe(true)
    expect(message.value).toBe('nuxtUiMongocamp.common.adminOnly')
  })

  it('lets an administrator through', () => {
    mockState.value = { profile: { isAdmin: true } }

    expect(useMongocampAdminGate().blocked.value).toBe(false)
  })

  it('fails open without a profile or without an isAdmin flag — the server decides', () => {
    expect(useMongocampAdminGate().blocked.value).toBe(false)
    mockState.value = { profile: {} }
    expect(useMongocampAdminGate().blocked.value).toBe(false)
  })

  it('never blocks in server proxy mode (the api key\'s power decides)', () => {
    mockOptions = { useServerProxy: true }
    mockState.value = { profile: { isAdmin: false } }

    expect(useMongocampAdminGate().blocked.value).toBe(false)
  })

  it('follows a profile that changes', () => {
    mockState.value = { profile: { isAdmin: false } }
    const { blocked } = useMongocampAdminGate()
    expect(blocked.value).toBe(true)

    mockState.value = { profile: { isAdmin: true } }
    expect(blocked.value).toBe(false)
  })
})
