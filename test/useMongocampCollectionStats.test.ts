import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCollectionApi = { getCollectionInformation: vi.fn(), aggregateRaw: vi.fn() }

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ collectionApi: mockCollectionApi }),
  useI18n: () => ({ t: (key: string) => key }),
}))

const { useMongocampCollectionStats } = await import('../src/runtime/composables/useMongocampCollectionStats')

beforeEach(() => vi.clearAllMocks())

describe('useMongocampCollectionStats', () => {
  it('getStorage maps the collection information, with a timeout', async () => {
    mockCollectionApi.getCollectionInformation.mockResolvedValueOnce({ ns: 'db.c', collectionType: 'collection', size: 10, count: 2, storageSize: 20, avgObjSize: 5, nindexes: 1, indexSizes: { _id_: 4 }, totalIndexSize: 4 })
    const storage = await useMongocampCollectionStats().getStorage('c')
    expect(storage).toMatchObject({ count: 2, size: 10, storageSize: 20, indexCount: 1, totalIndexSize: 4 })
    expect(mockCollectionApi.getCollectionInformation).toHaveBeenCalledWith({ collectionName: 'c' }, { signal: expect.any(AbortSignal) })
  })

  it('getIndexUsage runs $indexStats and never returns host or ns', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce({
      raw: { headers: { get: () => null } },
      value: () => Promise.resolve([{ name: 'name_1', key: { name: 1 }, host: 'mongo:27017', ns: 'db.c', spec: {}, accesses: { ops: { $numberLong: '7' }, since: { $date: '2026-11-01T10:00:00Z' } } }]),
    })
    const usage = await useMongocampCollectionStats().getIndexUsage('c')
    expect(mockCollectionApi.aggregateRaw.mock.calls[0]![0].mongoAggregateRequest.pipeline).toEqual([{ stage: '$indexStats', value: {} }])
    expect(usage).toEqual([{ name: 'name_1', key: { name: 1 }, ops: 7, since: '2026-11-01T10:00:00.000Z', unused: false }])
    expect(JSON.stringify(usage)).not.toMatch(/mongo:27017|db\.c/)
  })

  it('getIndexUsage is empty for an empty result', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce({ raw: { headers: { get: () => null } }, value: () => Promise.resolve([]) })
    expect(await useMongocampCollectionStats().getIndexUsage('c')).toEqual([])
  })
})
