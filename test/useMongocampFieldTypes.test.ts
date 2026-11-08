import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockGetFieldDetails = vi.fn()
const mockCache = ref<Record<string, unknown>>({})

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ collectionApi: { getFieldDetails: mockGetFieldDetails } }),
  useState: () => mockCache,
}))

const { useMongocampFieldTypes } = await import('../src/runtime/composables/useMongocampFieldTypes')

// recorded from server 1.8.1 (2026-11-08)
const DETAILS = [
  { path: '_id', types: [{ type: 'objectId', count: 6 }] },
  { path: 'age', types: [{ type: 'long', count: 15 }, { type: 'string', count: 5 }] },
  { path: 'n', types: [{ type: 'long', count: 4 }, { type: 'int', count: 2 }] },
  { path: 'name', types: [{ type: 'string', count: 6 }] },
  { path: 'nested', types: [{ type: 'object', count: 1 }] },
  { path: 'nested.x', types: [{ type: 'objectId', count: 1 }] },
  { path: 'tags', types: [{ type: 'array', count: 1 }] },
  { path: 'tags[]', types: [{ type: 'string', count: 2 }] },
  { path: 'flag', types: [{ type: 'bool', count: 3 }] },
  { path: 'when', types: [{ type: 'date', count: 3 }] },
  { path: 'blob', types: [{ type: 'binData', count: 2 }] },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockCache.value = {}
  mockGetFieldDetails.mockResolvedValue(DETAILS)
})

describe('useMongocampFieldTypes', () => {
  it('loads the field details once per collection and shares them between callers', async () => {
    const a = useMongocampFieldTypes('people')
    const b = useMongocampFieldTypes(() => 'people')
    await Promise.all([a.load(), b.load()])
    await a.load()

    expect(mockGetFieldDetails).toHaveBeenCalledTimes(1)
    expect(mockGetFieldDetails.mock.calls[0]![0]).toEqual({ collectionName: 'people' })
    expect(b.status()).toBe('ready')
    expect(b.fields().length).toBe(DETAILS.length)
  })

  it('keeps one entry per collection and follows a changing collection name', async () => {
    let current = 'people'
    const types = useMongocampFieldTypes(() => current)
    await types.load()
    current = 'orders'
    expect(types.status()).toBe('idle')
    await types.load()

    expect(mockGetFieldDetails).toHaveBeenCalledTimes(2)
    current = 'people'
    expect(types.status()).toBe('ready')
  })

  it('maps every path to the filter builder: types per family, _id exact, containers without operators, binary data left out', async () => {
    const types = useMongocampFieldTypes('people')
    await types.load()

    expect(Object.fromEntries(types.filterFields().map(f => [f.key, f.type]))).toEqual({
      '_id': 'objectId', 'age': 'number', 'n': 'number', 'name': 'string', 'nested': 'object', 'nested.x': 'objectId', 'tags': 'array', 'flag': 'boolean', 'when': 'date-time',
    })
  })

  it('leaves array elements out of the selectable paths but keeps them typed', async () => {
    const types = useMongocampFieldTypes('people')
    await types.load()

    expect(types.selectable().some(f => f.path === 'tags[]')).toBe(false)
    expect(types.typeOf('tags[]')).toMatchObject({ types: ['string'], element: true })
  })

  it('marks mixed kinds, but not int + long', async () => {
    const types = useMongocampFieldTypes('people')
    await types.load()

    expect(types.typeOf('age')).toMatchObject({ mixed: true, dominant: 'long', types: ['long', 'string'] })
    expect(types.typeOf('n')).toMatchObject({ mixed: false, dominant: 'long', types: ['long', 'int'] })
  })

  it('hints only paths with exactly one scalar type', async () => {
    const types = useMongocampFieldTypes('people')
    await types.load()

    expect(types.hints()).toEqual({ '_id': 'objectId', 'name': 'string', 'nested.x': 'objectId', 'tags[]': 'string', 'flag': 'bool', 'when': 'date' })
  })

  it('never throws: a failing request leaves everything empty and says so, and a later load retries', async () => {
    mockGetFieldDetails.mockRejectedValueOnce(new Error('down'))
    const types = useMongocampFieldTypes('people')

    await expect(types.load()).resolves.toBeUndefined()
    expect(types.status()).toBe('failed')
    expect(types.fields()).toEqual([])
    expect(types.filterFields()).toEqual([])

    await types.load()
    expect(types.status()).toBe('ready')
  })

  it('load(true) and invalidate() ask again', async () => {
    const types = useMongocampFieldTypes('people')
    await types.load()
    await types.load(true)
    expect(mockGetFieldDetails).toHaveBeenCalledTimes(2)

    types.invalidate()
    expect(types.status()).toBe('idle')
    await types.load()
    expect(mockGetFieldDetails).toHaveBeenCalledTimes(3)
  })

  it('skips a malformed entry instead of failing', async () => {
    mockGetFieldDetails.mockResolvedValue([{ path: 'ok', types: [{ type: 'string', count: 1 }] }, { path: '' }, null, { path: 'x' }])
    const types = useMongocampFieldTypes('people')
    await types.load()

    expect(types.fields().map(f => f.path)).toEqual(['ok', 'x'])
  })
})
