import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDatabaseApi = {
  listDatabases: vi.fn(),
  databaseInfos: vi.fn(),
  getDatabaseInfo: vi.fn(),
  listCollectionsByDatabase: vi.fn(),
}

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ databaseApi: mockDatabaseApi }),
}))

const { useMongocampSystem } = await import('../src/runtime/composables/useMongocampSystem')

beforeEach(() => {
  vi.clearAllMocks()
})

const withAbortSignal = () => expect.objectContaining({ signal: expect.any(AbortSignal) })

describe('listDatabases', () => {
  it('calls databaseApi.listDatabases with a timeout signal', async () => {
    mockDatabaseApi.listDatabases.mockResolvedValueOnce(['admin', 'app'])

    const { listDatabases } = useMongocampSystem()
    const result = await listDatabases()

    expect(mockDatabaseApi.listDatabases).toHaveBeenCalledWith(withAbortSignal())
    expect(result).toEqual(['admin', 'app'])
  })
})

describe('getDatabaseInfos', () => {
  it('calls databaseApi.databaseInfos with a timeout signal', async () => {
    const infos = [{ name: 'app', sizeOnDisk: 1024, empty: false }]
    mockDatabaseApi.databaseInfos.mockResolvedValueOnce(infos)

    const { getDatabaseInfos } = useMongocampSystem()
    const result = await getDatabaseInfos()

    expect(mockDatabaseApi.databaseInfos).toHaveBeenCalledWith(withAbortSignal())
    expect(result).toBe(infos)
  })
})

describe('getDatabaseInfo', () => {
  it('passes databaseName and a timeout signal through', async () => {
    const info = { name: 'app', sizeOnDisk: 1024, empty: false }
    mockDatabaseApi.getDatabaseInfo.mockResolvedValueOnce(info)

    const { getDatabaseInfo } = useMongocampSystem()
    const result = await getDatabaseInfo('app')

    expect(mockDatabaseApi.getDatabaseInfo).toHaveBeenCalledWith({ databaseName: 'app' }, withAbortSignal())
    expect(result).toBe(info)
  })
})

describe('listCollectionsByDatabase', () => {
  it('passes databaseName and a timeout signal through', async () => {
    mockDatabaseApi.listCollectionsByDatabase.mockResolvedValueOnce(['users', 'orders'])

    const { listCollectionsByDatabase } = useMongocampSystem()
    const result = await listCollectionsByDatabase('app')

    expect(mockDatabaseApi.listCollectionsByDatabase).toHaveBeenCalledWith({ databaseName: 'app' }, withAbortSignal())
    expect(result).toEqual(['users', 'orders'])
  })
})

describe('scope boundary', () => {
  it('does not expose deleteDatabase or any application/configuration methods', () => {
    const system = useMongocampSystem()
    expect(system).not.toHaveProperty('deleteDatabase')
    expect(system).not.toHaveProperty('listConfigurations')
    expect(system).not.toHaveProperty('getConfig')
    expect(system).not.toHaveProperty('getSettings')
  })
})
