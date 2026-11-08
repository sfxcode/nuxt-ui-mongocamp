import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = {
  collectionApi: { listCollectionInformation: vi.fn() },
  databaseApi: { databaseInfos: vi.fn() },
  systemApi: { viewCluster: vi.fn() },
  jobApi: { jobsList: vi.fn() },
}

vi.mock('#imports', () => ({ useMongocampClientApi: () => api }))

const { useMongocampServerOverview } = await import('../src/runtime/composables/useMongocampServerOverview')

const member = { name: 'n1', siteMaster: false, siteAddress: false, multicast: false, coordinator: true }
const info = (count: number) => ({ count, size: count * 10, storageSize: count * 20, avgObjSize: 10, nindexes: 2, totalIndexSize: count })

const summary = (name: string, count = 5, available = true) => ({ name, collectionType: 'Standard', available, ...info(count) })

beforeEach(() => {
  vi.resetAllMocks()
  api.databaseApi.databaseInfos.mockResolvedValue([{ name: 'mongocamp', sizeOnDisk: 4096, empty: false }])
  api.systemApi.viewCluster.mockResolvedValue({ coordinator: member, members: [member] })
  api.jobApi.jobsList.mockResolvedValue([{ name: 'j', group: 'g', cronExpression: '* * * * * ?', nextScheduledFireTime: new Date('2026-11-05T00:00:00Z') }])
  api.collectionApi.listCollectionInformation.mockResolvedValue(['orders', 'mc_users', 'photos.files', 'photos.chunks'].map(name => summary(name, name === 'orders' ? 100 : 5)))
})

describe('loadOverview', () => {
  it('reads the databases, the cluster, the jobs and the numbers of all collections in one request, leaving out mc_*', async () => {
    const overview = await useMongocampServerOverview().loadOverview()
    expect(overview.databases).toEqual([{ name: 'mongocamp', sizeOnDisk: 4096, empty: false }])
    expect(overview.cluster!.members).toHaveLength(1)
    expect(overview.jobs).toHaveLength(1)
    expect(overview.collections.map(c => c.name)).toEqual(['orders', 'photos.files', 'photos.chunks'])
    expect(overview.collections[0]).toEqual({ name: 'orders', count: 100, size: 1000, storageSize: 2000, avgObjSize: 10, indexCount: 2, totalIndexSize: 100 })
    expect(overview).toMatchObject({ collectionCount: 3, skipped: 0, failed: [], errors: {} })
    expect(api.collectionApi.listCollectionInformation).toHaveBeenCalledTimes(1)
    expect(api.collectionApi.listCollectionInformation.mock.calls[0]![1]).toEqual({ signal: expect.any(AbortSignal) })
  })

  it('stops at maxCollections and says how many were not read', async () => {
    api.collectionApi.listCollectionInformation.mockResolvedValue(Array.from({ length: 10 }, (_, i) => summary(`c${i}`)))
    const overview = await useMongocampServerOverview().loadOverview({ maxCollections: 4 })
    expect(overview.collections).toHaveLength(4)
    expect(overview).toMatchObject({ collectionCount: 10, skipped: 6 })
  })

  it('keeps every part that worked when others fail, and says which failed', async () => {
    const boom = new Error('no')
    api.databaseApi.databaseInfos.mockRejectedValue(boom)
    api.systemApi.viewCluster.mockRejectedValue(new Error('cluster'))
    api.jobApi.jobsList.mockRejectedValue(new Error('jobs'))
    api.collectionApi.listCollectionInformation.mockResolvedValue(['orders', 'photos.files', 'photos.chunks'].map(name => summary(name, 1, name !== 'photos.files')))
    const overview = await useMongocampServerOverview().loadOverview()
    expect(overview.databases).toBeNull()
    expect(overview.cluster).toBeNull()
    expect(overview.jobs).toBeNull()
    expect(overview.collections.map(c => c.name)).toEqual(['orders', 'photos.chunks'])
    expect(overview.failed).toEqual(['photos.files'])
    expect(Object.keys(overview.errors).sort()).toEqual(['cluster', 'databases', 'jobs'])
    expect(overview.errors.databases).toBe(boom)
  })

  it('returns what it has when the collection numbers cannot be read', async () => {
    api.collectionApi.listCollectionInformation.mockRejectedValue(new Error('x'))
    const overview = await useMongocampServerOverview().loadOverview()
    expect(overview.collections).toEqual([])
    expect(overview.databases).toHaveLength(1)
    expect(overview.errors.collections).toBeInstanceOf(Error)
  })

  it('rejects with an AbortError when aborted, before anything or while reading', async () => {
    const early = new AbortController()
    early.abort()
    await expect(useMongocampServerOverview().loadOverview({ signal: early.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(api.databaseApi.databaseInfos).not.toHaveBeenCalled()

    const controller = new AbortController()
    api.collectionApi.listCollectionInformation.mockImplementation(async () => {
      controller.abort()
      return [summary('orders')]
    })
    await expect(useMongocampServerOverview().loadOverview({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
