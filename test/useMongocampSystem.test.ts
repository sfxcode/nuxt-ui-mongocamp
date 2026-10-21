import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDatabaseApi = {
  listDatabases: vi.fn(),
  databaseInfos: vi.fn(),
  getDatabaseInfo: vi.fn(),
  listCollectionsByDatabase: vi.fn(),
}

const mockApplicationApi = {
  settings: vi.fn(),
  listConfigurations: vi.fn(),
  getConfig: vi.fn(),
  // never called by this composable — present so a test can prove that
  shutdown: vi.fn(),
  updateConfiguration: vi.fn(),
}

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ databaseApi: mockDatabaseApi, applicationApi: mockApplicationApi }),
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
  // The settings reads came back with plan 12 (read-only, masked, with a timeout); everything that
  // changes or stops the server stays out.
  it('does not expose deleteDatabase or any write/shutdown method', () => {
    const system = useMongocampSystem()
    for (const forbidden of ['deleteDatabase', 'shutdown', 'updateConfiguration', 'setConfig']) {
      expect(system).not.toHaveProperty(forbidden)
    }
  })
})

describe('read-only server settings', () => {
  const SECRET = 'jwt-secret-value-0123456789abcdef'
  const settings = {
    routesPlugins: ['a', 'b'],
    filePlugins: ['fs'],
    ignoredPlugins: [],
    configurations: { AUTH_SECRET: SECRET, CONNECTION_PASSWORD: { value: 'db-password' } },
  }

  it('getSettings returns the plugin lists only — the repeated configuration map (with its secrets) is dropped', async () => {
    mockApplicationApi.settings.mockResolvedValueOnce(settings)

    const result = await useMongocampSystem().getSettings()

    expect(mockApplicationApi.settings).toHaveBeenCalledWith(withAbortSignal())
    expect(result).toEqual({ routesPlugins: ['a', 'b'], filePlugins: ['fs'], ignoredPlugins: [] })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('getSettings tolerates missing plugin lists', async () => {
    mockApplicationApi.settings.mockResolvedValueOnce({ configurations: {} })

    expect(await useMongocampSystem().getSettings()).toEqual({ routesPlugins: [], filePlugins: [], ignoredPlugins: [] })
  })

  it('listConfigurations returns masked rows, with a timeout signal', async () => {
    mockApplicationApi.listConfigurations.mockResolvedValueOnce([
      { key: 'SERVER_PORT', value: 8080, configType: 'Long', needsRestartForActivation: true, comment: '' },
      { key: 'AUTH_SECRET', value: SECRET, configType: 'String', needsRestartForActivation: true, comment: '' },
    ])

    const rows = await useMongocampSystem().listConfigurations()

    expect(mockApplicationApi.listConfigurations).toHaveBeenCalledWith(withAbortSignal())
    expect(rows.map(r => [r.key, r.value, r.masked])).toEqual([['AUTH_SECRET', '••••••••', true], ['SERVER_PORT', '8080', false]])
    expect(JSON.stringify(rows)).not.toContain(SECRET)
  })

  it('getConfig asks for one key and returns it masked', async () => {
    mockApplicationApi.getConfig.mockResolvedValueOnce({ key: 'CONNECTION_PASSWORD', value: { value: 'db-password' }, configType: 'Option[String]' })

    const row = await useMongocampSystem().getConfig('CONNECTION_PASSWORD')

    expect(mockApplicationApi.getConfig).toHaveBeenCalledWith({ configurationKey: 'CONNECTION_PASSWORD' }, withAbortSignal())
    expect(row).toMatchObject({ key: 'CONNECTION_PASSWORD', value: '••••••••', masked: true })
  })

  it('getConfig throws when the server answers with something that is not a configuration', async () => {
    mockApplicationApi.getConfig.mockResolvedValueOnce(null)

    await expect(useMongocampSystem().getConfig('X')).rejects.toThrow()
  })

  it('lets a failure reach the caller', async () => {
    const error = Object.assign(new Error('x'), { name: 'FetchError' })
    mockApplicationApi.listConfigurations.mockRejectedValueOnce(error)

    await expect(useMongocampSystem().listConfigurations()).rejects.toBe(error)
  })

  it('never writes: shutdown and updateConfiguration are not even exposed', async () => {
    mockApplicationApi.settings.mockResolvedValueOnce(settings)
    mockApplicationApi.listConfigurations.mockResolvedValueOnce([])
    const system = useMongocampSystem()

    await system.getSettings()
    await system.listConfigurations()

    expect(Object.keys(system).sort()).toEqual(['getConfig', 'getDatabaseInfo', 'getDatabaseInfos', 'getSettings', 'listCollectionsByDatabase', 'listConfigurations', 'listDatabases'])
    expect(mockApplicationApi.shutdown).not.toHaveBeenCalled()
    expect(mockApplicationApi.updateConfiguration).not.toHaveBeenCalled()
  })
})
