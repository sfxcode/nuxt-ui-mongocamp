import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCollectionApi = { listCollections: vi.fn(), getCollectionInformation: vi.fn() }
const mockDocumentApi = { listDocumentsRaw: vi.fn(), insertMany: vi.fn() }
const mockIndexApi = { listIndices: vi.fn(), createIndex: vi.fn(), createTextIndex: vi.fn() }

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ collectionApi: mockCollectionApi, documentApi: mockDocumentApi, indexApi: mockIndexApi }),
  useMongocampStorage: () => ({ value: { profile: { user: 'alice' } } }),
}))

const { useMongocampCollectionCopy } = await import('../src/runtime/composables/useMongocampCollectionCopy')

const hex = (n: number) => n.toString(16).padStart(24, '0')
const docs = (count: number) => Array.from({ length: count }, (_, i) => ({ _id: hex(i + 1), n: i }))

// a source with `total` documents: the 1-row count request and the 1000-row pages
function serveSource(total: number, rows = docs(total)) {
  mockDocumentApi.listDocumentsRaw.mockImplementation(async (request: { rowsPerPage?: number, page?: number }) => {
    const size = request.rowsPerPage ?? 100
    const page = request.page ?? 1
    return {
      raw: { headers: { get: (name: string) => (name === 'x-pagination-count-rows' ? String(total) : null) } },
      value: () => Promise.resolve(rows.slice((page - 1) * size, page * size)),
    }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockCollectionApi.listCollections.mockResolvedValue(['orders'])
  mockDocumentApi.insertMany.mockResolvedValue({})
  mockIndexApi.listIndices.mockResolvedValue([])
  mockIndexApi.createIndex.mockResolvedValue({ name: 'x' })
  mockIndexApi.createTextIndex.mockResolvedValue({ name: 'x' })
})

describe('copyCollection', () => {
  it('reads the source in pages of 1000 and inserts into the new collection in batches, keeping the documents as they are', async () => {
    serveSource(2500)
    const { copyCollection } = useMongocampCollectionCopy()
    const result = await copyCollection({ source: 'orders', target: 'orders_copy' })

    expect(result).toMatchObject({ sourceTotal: 2500, inserted: 2500, failedBatches: [], aborted: false, skipped: 0 })
    expect(result.refused).toBeUndefined()
    const sizes = mockDocumentApi.insertMany.mock.calls.map(c => c[0].requestBody.length)
    expect(sizes).toEqual([1000, 1000, 500])
    expect(mockDocumentApi.insertMany.mock.calls.every(c => c[0].collectionName === 'orders_copy')).toBe(true)
    const first = mockDocumentApi.insertMany.mock.calls[0]![0].requestBody[0]
    expect(first).toEqual({ _id: hex(1), n: 0 }) // _id kept, nothing added (no metadata stamp)
  })

  it('passes the filter to the count and to every page', async () => {
    serveSource(3)
    await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', filter: 'status:open' })
    expect(mockDocumentApi.listDocumentsRaw.mock.calls.every(c => c[0].filter === 'status:open')).toBe(true)
  })

  it('refuses when the target name exists now (checked again just before writing), case-insensitively', async () => {
    mockCollectionApi.listCollections.mockResolvedValue(['orders', 'Orders_Copy'])
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'orders_copy' })
    expect(result.refused).toBe('target-exists')
    expect(mockDocumentApi.listDocumentsRaw).not.toHaveBeenCalled()
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()
  })

  it('refuses a source above the cap without reading or writing anything', async () => {
    serveSource(60)
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', maxDocuments: 50 })
    expect(result).toMatchObject({ refused: 'too-many-documents', sourceTotal: 60, rows: [] })
    expect(mockDocumentApi.listDocumentsRaw).toHaveBeenCalledTimes(1) // only the one-row count
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()
  })

  it('copies nothing from an empty source and does not call insertMany with an empty batch', async () => {
    serveSource(0, [])
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x' })
    expect(result).toMatchObject({ sourceTotal: 0, inserted: 0 })
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()
  })

  it('reports progress of both phases', async () => {
    serveSource(1500)
    const seen: string[] = []
    await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', onProgress: p => seen.push(`${p.phase}:${p.done}/${p.total}`) })
    expect(seen).toContain('reading:1000/1500')
    expect(seen).toContain('reading:1500/1500')
    expect(seen.at(-1)).toBe('writing:1500/1500')
  })

  it('writes nothing when aborted while reading', async () => {
    serveSource(3000)
    const controller = new AbortController()
    mockDocumentApi.listDocumentsRaw.mockImplementationOnce(async () => ({ raw: { headers: { get: () => '3000' } }, value: () => Promise.resolve([]) })) // the count
    mockDocumentApi.listDocumentsRaw.mockImplementationOnce(async () => {
      controller.abort()
      return { raw: { headers: { get: () => '3000' } }, value: () => Promise.resolve(docs(1000)) }
    })
    await expect(useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', signal: controller.signal })).rejects.toMatchObject({ name: expect.stringMatching(/Abort/) })
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()
  })

  it('reports a failed batch with its position and keeps the rows for a retry', async () => {
    serveSource(2500)
    mockDocumentApi.insertMany.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 400 } })).mockResolvedValue({})
    const { copyCollection, retryBatches } = useMongocampCollectionCopy()
    const result = await copyCollection({ source: 'orders', target: 'x' })

    expect(result.inserted).toBe(1500)
    expect(result.failedBatches).toHaveLength(1)
    expect(result.failedBatches[0]).toMatchObject({ start: 1000, count: 1000, mayBePartial: false })
    expect(result.rows).toHaveLength(2500)

    mockDocumentApi.insertMany.mockClear()
    const again = await retryBatches('x', result.rows, result.failedBatches)
    expect(again.inserted).toBe(1000)
    expect(mockDocumentApi.insertMany.mock.calls[0]![0].requestBody[0]).toEqual({ _id: hex(1001), n: 1000 })
  })

  it('stops writing when aborted between batches and says how many were not sent', async () => {
    serveSource(2500)
    const controller = new AbortController()
    mockDocumentApi.insertMany.mockImplementation(async () => controller.abort())
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', signal: controller.signal })
    expect(result).toMatchObject({ inserted: 1000, aborted: true, skipped: 1500 })
  })
})

describe('backupCollection', () => {
  const now = new Date(2026, 10, 4, 9, 5, 7)

  it('copies into <source>_backup_<timestamp> without a name from the user and says where it went', async () => {
    serveSource(3)
    const seen: string[] = []
    const result = await useMongocampCollectionCopy().backupCollection({ source: 'orders', now, onTarget: name => seen.push(name) })

    expect(result.target).toBe('orders_backup_20261104_090507')
    expect(seen).toEqual(['orders_backup_20261104_090507'])
    expect(result).toMatchObject({ inserted: 3, failedBatches: [] })
    expect(mockDocumentApi.insertMany.mock.calls[0]![0].collectionName).toBe('orders_backup_20261104_090507')
  })

  it('takes the next free name when a backup of this second exists', async () => {
    serveSource(2)
    mockCollectionApi.listCollections.mockResolvedValue(['orders', 'orders_backup_20261104_090507'])
    const result = await useMongocampCollectionCopy().backupCollection({ source: 'orders', now })
    expect(result.target).toBe('orders_backup_20261104_090507_2')
  })

  it('chooses a new name once more when another session took the first one meanwhile', async () => {
    serveSource(2)
    // the name list is read for the choice and again inside the copy: the second read already shows the chosen name
    mockCollectionApi.listCollections
      .mockResolvedValueOnce(['orders'])
      .mockResolvedValueOnce(['orders', 'orders_backup_20261104_090507'])
      .mockResolvedValue(['orders', 'orders_backup_20261104_090507'])
    const result = await useMongocampCollectionCopy().backupCollection({ source: 'orders', now })
    expect(result.refused).toBeUndefined()
    expect(result.target).toBe('orders_backup_20261104_090507_2')
    expect(mockDocumentApi.insertMany.mock.calls[0]![0].collectionName).toBe('orders_backup_20261104_090507_2')
  })

  it('refuses a source that cannot be copied, before any request', async () => {
    for (const source of ['mc_users', 'photos.files', 'system.views']) {
      await expect(useMongocampCollectionCopy().backupCollection({ source })).rejects.toMatchObject({ name: 'CollectionNotCopyableError' })
    }
    expect(mockCollectionApi.listCollections).not.toHaveBeenCalled()
  })

  it('keeps the cap, the filter and the progress of a normal copy', async () => {
    serveSource(60)
    const refused = await useMongocampCollectionCopy().backupCollection({ source: 'orders', maxDocuments: 50, now })
    expect(refused).toMatchObject({ refused: 'too-many-documents', target: 'orders_backup_20261104_090507' })
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()

    serveSource(3)
    await useMongocampCollectionCopy().backupCollection({ source: 'orders', filter: 'a:1', now })
    expect(mockDocumentApi.listDocumentsRaw.mock.calls.at(-1)![0].filter).toBe('a:1')
  })
})

const idx = (patch: Record<string, unknown>) => ({ name: 'x', keys: {}, unique: false, text: false, expire: false, expireAfterSeconds: -1, weights: {}, ...patch })
const SOURCE_INDEXES = [
  idx({ name: '_id_', keys: { _id: 1 }, unique: true }),
  idx({ name: 'a_1', keys: { a: 1 } }),
  idx({ name: 'c_1_b_-1', keys: { b: -1, c: 1 }, unique: true }),
  idx({ name: 'when_-1', keys: { when: -1 }, expire: true, expireAfterSeconds: 3600 }),
  idx({ name: 'body_text', text: true, keys: { _ftsx: 1, _fts: 'text' }, weights: { body: 1 } }),
  idx({ name: 'custom_ba', keys: { a: 1, b: 1 } }),
]

describe('copying the indexes', () => {
  it('creates the same indexes on the target after the documents, all but _id_, and lists what it had to skip', async () => {
    serveSource(3)
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    const order: string[] = []
    mockDocumentApi.insertMany.mockImplementation(async () => order.push('insert'))
    mockIndexApi.createIndex.mockImplementation(async () => order.push('index'))
    mockIndexApi.createTextIndex.mockImplementation(async () => order.push('index'))

    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'orders_copy', copyIndexes: true })

    expect(mockIndexApi.listIndices).toHaveBeenCalledWith({ collectionName: 'orders' })
    expect(order).toEqual(['insert', 'index', 'index', 'index', 'index'])
    expect(mockIndexApi.createIndex.mock.calls.map(c => c[0])).toEqual([
      { collectionName: 'orders_copy', indexCreateRequest: { keys: { a: 1 }, indexOptionsRequest: { name: 'a_1' } } },
      { collectionName: 'orders_copy', indexCreateRequest: { keys: { c: 1, b: -1 }, indexOptionsRequest: { name: 'c_1_b_-1', unique: true } } },
      { collectionName: 'orders_copy', indexCreateRequest: { keys: { when: -1 }, indexOptionsRequest: { name: 'when_-1', expireAfter: '3600s' } } },
    ])
    expect(mockIndexApi.createTextIndex).toHaveBeenCalledWith({ collectionName: 'orders_copy', fieldName: 'body' })
    expect(result.indexes).toEqual({ copied: ['a_1', 'c_1_b_-1', 'when_-1', 'body_text'], skipped: [{ name: 'custom_ba', reason: 'unknown-key-order' }], failed: [] })
  })

  it('does nothing about indexes unless asked', async () => {
    serveSource(3)
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x' })
    expect(mockIndexApi.listIndices).not.toHaveBeenCalled()
    expect(result.indexes).toBeUndefined()
  })

  it('reports an index the server refuses and still creates the others', async () => {
    serveSource(3)
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    const boom = new Error('refused')
    mockIndexApi.createIndex.mockRejectedValueOnce(boom).mockResolvedValue({})
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', copyIndexes: true })
    expect(result.indexes!.failed).toEqual([{ name: 'a_1', error: boom }])
    expect(result.indexes!.copied).toEqual(['c_1_b_-1', 'when_-1', 'body_text'])
  })

  it('creates no index after a failed batch or a stop (the copy is incomplete), and keeps the documents result', async () => {
    serveSource(2500)
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    mockDocumentApi.insertMany.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('x')).mockResolvedValue({})
    const failed = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', copyIndexes: true })
    expect(failed.failedBatches).toHaveLength(1)
    expect(failed.indexes).toBeUndefined()
    expect(mockIndexApi.createIndex).not.toHaveBeenCalled()
  })

  it('still creates the indexes of an empty source (a backup of an empty collection keeps its structure)', async () => {
    serveSource(0, [])
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', copyIndexes: true })
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()
    expect(result.indexes!.copied).toHaveLength(4)
  })

  it('reports when the indexes of the source cannot be listed, without failing the copy', async () => {
    serveSource(3)
    mockIndexApi.listIndices.mockRejectedValue(new Error('nope'))
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', copyIndexes: true })
    expect(result.inserted).toBe(3)
    expect(result.indexes).toBeUndefined()
    expect(result.indexesError).toBeInstanceOf(Error)
  })

  it('reports index progress, and backupCollection passes the option on', async () => {
    serveSource(3)
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    const seen: string[] = []
    const result = await useMongocampCollectionCopy().backupCollection({ source: 'orders', copyIndexes: true, now: new Date(2026, 10, 4, 9, 5, 7), onProgress: p => seen.push(`${p.phase}:${p.done}/${p.total}`) })
    expect(result.indexes!.copied).toHaveLength(4)
    expect(seen.at(-1)).toBe('indexes:5/5')
    expect(mockIndexApi.createIndex.mock.calls[0]![0].collectionName).toBe('orders_backup_20261104_090507')
  })

  it('copyIndexes can be run on its own (after a retry)', async () => {
    mockIndexApi.listIndices.mockResolvedValue(SOURCE_INDEXES)
    const result = await useMongocampCollectionCopy().copyIndexes('orders', 'orders_copy')
    expect(result.copied).toHaveLength(4)
  })
})

describe('counts', () => {
  it('counts through the pagination header and reads the collection information', async () => {
    serveSource(42)
    mockCollectionApi.getCollectionInformation.mockResolvedValue({ count: 7 })
    const { countDocuments, collectionCount } = useMongocampCollectionCopy()
    expect(await countDocuments('orders', 'a:1')).toBe(42)
    expect(await collectionCount('x')).toBe(7)
  })
})
