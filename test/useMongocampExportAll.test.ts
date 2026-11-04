import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetchAllDocuments = vi.fn()
const mockDownload = vi.hoisted(() => vi.fn())

vi.mock('../src/runtime/composables/useMongocampFetchAll', () => ({
  useMongocampFetchAll: () => ({ fetchAllDocuments: mockFetchAllDocuments }),
}))

vi.mock('../src/runtime/utils/exportRows', async importOriginal => ({
  ...await importOriginal<typeof import('../src/runtime/utils/exportRows')>(),
  downloadTextFile: mockDownload,
}))

const { useMongocampExportAll } = await import('../src/runtime/composables/useMongocampExportAll')

const fetched = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ rows, total: rows.length, truncated: false, totalChanged: false, duplicates: 0, pages: 1, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAllDocuments.mockResolvedValue(fetched([{ _id: 'a', n: 1 }, { _id: 'b', n: 2 }]))
})

describe('exportCollection', () => {
  it('reads every document of the collection and downloads the file', async () => {
    const { exportCollection } = useMongocampExportAll()

    const result = await exportCollection({ collection: 'customers', format: 'csv', filename: 'all.csv' })

    expect(mockFetchAllDocuments).toHaveBeenCalledTimes(1)
    expect(mockFetchAllDocuments.mock.calls[0]![0]).toBe('customers')
    expect(mockDownload).toHaveBeenCalledWith('all.csv', '_id,n\r\na,1\r\nb,2', 'text/csv')
    expect(result).toMatchObject({ content: '_id,n\r\na,1\r\nb,2', filename: 'all.csv', mimeType: 'text/csv', format: 'csv', rowCount: 2, total: 2, truncated: false, totalChanged: false })
  })

  it('writes json, ndjson and csv with the right mime type and extension', async () => {
    const { exportCollection } = useMongocampExportAll()

    const json = await exportCollection({ collection: 'c', format: 'json', download: false })
    const ndjson = await exportCollection({ collection: 'c', format: 'ndjson', download: false })

    expect(json).toMatchObject({ mimeType: 'application/json', content: '[\n  {"_id":"a","n":1},\n  {"_id":"b","n":2}\n]\n' })
    expect(json.filename).toMatch(/^c-\d{8}-\d{4}\.json$/)
    expect(ndjson).toMatchObject({ mimeType: 'application/x-ndjson', content: '{"_id":"a","n":1}\n{"_id":"b","n":2}\n' })
    expect(ndjson.filename).toMatch(/\.ndjson$/)
  })

  it('only returns the text for download: false', async () => {
    const result = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', download: false })

    expect(mockDownload).not.toHaveBeenCalled()
    expect(result.content).toContain('"_id":"a"')
  })

  it('passes filter, sort, projection, page size, progress and signal on, and caps at 50 000 documents by default', async () => {
    const onProgress = vi.fn()
    const signal = new AbortController().signal

    await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', download: false, filter: 'g:3', sort: ['name'], projection: ['_id', 'name'], pageSize: 200, onProgress, signal })

    expect(mockFetchAllDocuments.mock.calls[0]![1]).toMatchObject({ filter: 'g:3', sort: ['name'], projection: ['_id', 'name'], pageSize: 200, maxRows: 50_000, onProgress, signal })
  })

  it('lets the caller raise the cap, and drops a document repeated by paging drift (keyed by _id)', async () => {
    await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', download: false, maxRows: 200_000 })

    const options = mockFetchAllDocuments.mock.calls[0]![1] as { maxRows: number, keyOf: (row: { _id: unknown }) => string }
    expect(options.maxRows).toBe(200_000)
    expect(options.keyOf({ _id: 'abc' })).toBe('abc')
  })

  it('writes the documents as the table shows them: wrappers unwrapped, an exact long kept', async () => {
    mockFetchAllDocuments.mockResolvedValue(fetched([{ _id: { $oid: 'a' }, when: { $date: '2024-03-01T10:00:00.000Z' }, big: { $numberLong: '9007199254740993' } }]))

    const { content } = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'ndjson', download: false })

    expect(content).toBe('{"_id":"a","when":"2024-03-01T10:00:00.000Z","big":9007199254740993}\n')
  })

  it('says when the file is incomplete (the cap was hit) and when the collection changed while reading — and still downloads what was read', async () => {
    mockFetchAllDocuments.mockResolvedValue(fetched([{ _id: 'a' }], { total: 90_000, truncated: true, totalChanged: true }))

    const result = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json' })

    expect(result).toMatchObject({ rowCount: 1, total: 90_000, truncated: true, totalChanged: true })
    expect(mockDownload).toHaveBeenCalledTimes(1)
  })

  it('uses the given CSV columns', async () => {
    const { content } = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'csv', download: false, columns: ['n', '_id'] })

    expect(content).toBe('n,_id\r\n1,a\r\n2,b')
  })

  it('downloads nothing when the read is aborted or fails, and lets the error through', async () => {
    mockFetchAllDocuments.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(useMongocampExportAll().exportCollection({ collection: 'c', format: 'csv' })).rejects.toMatchObject({ name: 'AbortError' })

    mockFetchAllDocuments.mockRejectedValueOnce(new Error('boom'))
    await expect(useMongocampExportAll().exportCollection({ collection: 'c', format: 'csv' })).rejects.toThrow('boom')
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('exports an empty collection as an empty file', async () => {
    mockFetchAllDocuments.mockResolvedValue(fetched([]))

    const json = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', download: false })
    const csv = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'csv', download: false })

    expect(json).toMatchObject({ content: '[]\n', rowCount: 0 })
    expect(csv.content).toBe('')
  })
})
