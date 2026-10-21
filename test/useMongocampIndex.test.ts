import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIndexApi = {
  listIndices: vi.fn(),
  createIndex: vi.fn(),
  createUniqueIndex: vi.fn(),
  createIndexForField: vi.fn(),
  createTextIndex: vi.fn(),
  createExpiringIndex: vi.fn(),
  deleteIndex: vi.fn(),
}

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ indexApi: mockIndexApi }),
}))

const { useMongocampIndex } = await import('../src/runtime/composables/useMongocampIndex')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listIndexes', () => {
  it('calls indexApi.listIndices with the collection name', async () => {
    const indexes = [{ name: '_id_' }]
    mockIndexApi.listIndices.mockResolvedValueOnce(indexes)

    const { listIndexes } = useMongocampIndex()
    const result = await listIndexes('users')

    expect(mockIndexApi.listIndices).toHaveBeenCalledWith({ collectionName: 'users' })
    expect(result).toBe(indexes)
  })
})

describe('createIndex', () => {
  it('nests keys and options under indexCreateRequest', async () => {
    mockIndexApi.createIndex.mockResolvedValueOnce({ name: 'email_1' })

    const { createIndex } = useMongocampIndex()
    await createIndex('users', { email: 1 }, { unique: true })

    expect(mockIndexApi.createIndex).toHaveBeenCalledWith({
      collectionName: 'users',
      indexCreateRequest: { keys: { email: 1 }, indexOptionsRequest: { unique: true } },
    })
  })

  it('passes undefined options through unchanged when omitted', async () => {
    mockIndexApi.createIndex.mockResolvedValueOnce({ name: 'email_1' })

    const { createIndex } = useMongocampIndex()
    await createIndex('users', { email: 1 })

    expect(mockIndexApi.createIndex).toHaveBeenCalledWith({
      collectionName: 'users',
      indexCreateRequest: { keys: { email: 1 }, indexOptionsRequest: undefined },
    })
  })
})

describe('createUniqueIndex', () => {
  it('passes collectionName, fieldName, and sortAscending as flat params', async () => {
    mockIndexApi.createUniqueIndex.mockResolvedValueOnce({ name: 'email_1' })

    const { createUniqueIndex } = useMongocampIndex()
    await createUniqueIndex('users', 'email', false)

    expect(mockIndexApi.createUniqueIndex).toHaveBeenCalledWith({
      collectionName: 'users',
      fieldName: 'email',
      sortAscending: false,
    })
  })
})

describe('createTextIndex', () => {
  it('passes collectionName and fieldName only', async () => {
    mockIndexApi.createTextIndex.mockResolvedValueOnce({ name: 'name_text' })

    const { createTextIndex } = useMongocampIndex()
    await createTextIndex('users', 'name')

    expect(mockIndexApi.createTextIndex).toHaveBeenCalledWith({
      collectionName: 'users',
      fieldName: 'name',
    })
  })
})

describe('createExpiringIndex', () => {
  it('passes collectionName, fieldName, and duration as flat params', async () => {
    mockIndexApi.createExpiringIndex.mockResolvedValueOnce({ name: 'createdAt_1' })

    const { createExpiringIndex } = useMongocampIndex()
    await createExpiringIndex('sessions', 'createdAt', '3600s')

    expect(mockIndexApi.createExpiringIndex).toHaveBeenCalledWith({
      collectionName: 'sessions',
      fieldName: 'createdAt',
      duration: '3600s',
    })
  })
})

describe('deleteIndex', () => {
  it('passes collectionName and indexName straight through', async () => {
    mockIndexApi.deleteIndex.mockResolvedValueOnce({ dropped: true })

    const { deleteIndex } = useMongocampIndex()
    const result = await deleteIndex('users', 'email_1')

    expect(mockIndexApi.deleteIndex).toHaveBeenCalledWith({ collectionName: 'users', indexName: 'email_1' })
    expect(result).toEqual({ dropped: true })
  })
})

describe('createIndexForField', () => {
  it('passes collection, field and direction, with a timeout signal', async () => {
    mockIndexApi.createIndexForField.mockResolvedValueOnce({ name: 'email_-1' })

    const result = await useMongocampIndex().createIndexForField('users', 'email', false)

    expect(mockIndexApi.createIndexForField).toHaveBeenCalledWith({ collectionName: 'users', fieldName: 'email', sortAscending: false }, { signal: expect.any(AbortSignal) })
    expect(result).toEqual({ name: 'email_-1' })
  })

  it('defaults to ascending', async () => {
    mockIndexApi.createIndexForField.mockResolvedValueOnce({ name: 'email_1' })

    await useMongocampIndex().createIndexForField('users', 'email')

    expect(mockIndexApi.createIndexForField).toHaveBeenCalledWith({ collectionName: 'users', fieldName: 'email', sortAscending: true }, expect.anything())
  })

  it('rethrows a refusal (duplicate or incompatible index) instead of swallowing it', async () => {
    const error = Object.assign(new Error('conflict'), { response: { status: 500 } })
    mockIndexApi.createIndexForField.mockRejectedValueOnce(error)

    await expect(useMongocampIndex().createIndexForField('users', 'email')).rejects.toBe(error)
  })
})
