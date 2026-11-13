import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockListCollections = vi.fn()
const mockState = ref<{ profile?: { user: string } }>({})
const mockCache = ref<unknown>(undefined)

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ collectionApi: { listCollections: mockListCollections } }),
  useMongocampStorage: () => mockState,
  useState: (_key: string, init: () => unknown) => {
    if (mockCache.value === undefined) mockCache.value = init()
    return mockCache
  },
}))

const { useMongocampCollectionNames } = await import('../src/runtime/composables/useMongocampCollectionNames')

const NAMES = ['people', 'mc_users', 'images.files', 'images.chunks', 'orders']

beforeEach(() => {
  vi.resetAllMocks()
  mockCache.value = undefined
  mockState.value = { profile: { user: 'carol' } }
  mockListCollections.mockResolvedValue(NAMES)
})

describe('useMongocampCollectionNames', () => {
  it('starts idle and empty, without a request', () => {
    const { names, status } = useMongocampCollectionNames()

    expect(status.value).toBe('idle')
    expect(names.value).toEqual([])
    expect(mockListCollections).not.toHaveBeenCalled()
  })

  it('loads once and shares the list between callers, also when they ask at the same time', async () => {
    const a = useMongocampCollectionNames()
    const b = useMongocampCollectionNames()
    await Promise.all([a.load(), b.load()])
    await a.load()

    expect(mockListCollections).toHaveBeenCalledTimes(1)
    expect(b.status.value).toBe('ready')
    expect(b.names.value).toEqual(NAMES)
  })

  it('groups the names', async () => {
    const { load, collections, buckets, system } = useMongocampCollectionNames()
    await load()

    expect(collections.value).toEqual(['orders', 'people'])
    expect(buckets.value).toEqual(['images'])
    expect(system.value).toEqual(['mc_users'])
  })

  it('refresh asks again', async () => {
    const { load, refresh, names } = useMongocampCollectionNames()
    await load()
    mockListCollections.mockResolvedValue(['only'])
    await refresh()

    expect(mockListCollections).toHaveBeenCalledTimes(2)
    expect(names.value).toEqual(['only'])
  })

  it('never throws: a failure is a status, and the last list stays', async () => {
    const { load, refresh, names, status } = useMongocampCollectionNames()
    await load()
    mockListCollections.mockRejectedValue(new Error('down'))
    await expect(refresh()).resolves.toBeUndefined()

    expect(status.value).toBe('failed')
    expect(names.value).toEqual(NAMES)
  })

  it('a failed first load is retried by the next load()', async () => {
    mockListCollections.mockRejectedValueOnce(new Error('down'))
    const { load, status, names } = useMongocampCollectionNames()
    await load()
    expect(status.value).toBe('failed')
    await load()

    expect(status.value).toBe('ready')
    expect(names.value).toEqual(NAMES)
  })

  it('set fills the cache without a request, invalidate empties it', async () => {
    const { set, invalidate, load, names, status } = useMongocampCollectionNames()
    set(['a', 'b'])
    await load()

    expect(mockListCollections).not.toHaveBeenCalled()
    expect(names.value).toEqual(['a', 'b'])

    invalidate()
    expect(status.value).toBe('idle')
    expect(names.value).toEqual([])
    await load()
    expect(mockListCollections).toHaveBeenCalledTimes(1)
  })

  it('never shows one user\'s list to another', async () => {
    const { load, names, status } = useMongocampCollectionNames()
    await load()
    mockState.value = { profile: { user: 'dave' } }

    expect(names.value).toEqual([])
    expect(status.value).toBe('idle')

    mockListCollections.mockResolvedValue(['dave_only'])
    await load()
    expect(names.value).toEqual(['dave_only'])
    expect(mockListCollections).toHaveBeenCalledTimes(2)
  })

  it('drops an answer that arrives after the user changed', async () => {
    let answer: (names: string[]) => void = () => {}
    mockListCollections.mockReturnValue(new Promise<string[]>((resolve) => {
      answer = resolve
    }))
    const { load, names, status } = useMongocampCollectionNames()
    const pending = load()
    mockState.value = { profile: { user: 'dave' } }
    answer(NAMES)
    await pending

    expect(names.value).toEqual([])
    expect(status.value).toBe('idle')
  })

  it('works without a profile (server proxy mode)', async () => {
    mockState.value = {}
    const { load, names } = useMongocampCollectionNames()
    await load()

    expect(names.value).toEqual(NAMES)
  })

  it('sends a timeout signal', async () => {
    await useMongocampCollectionNames().load()

    expect(mockListCollections.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal)
  })
})
