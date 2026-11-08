import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExportDocumentsRaw = vi.fn()
const mockDownloadBlob = vi.hoisted(() => vi.fn())

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ documentApi: { exportDocumentsRaw: mockExportDocumentsRaw } }),
}))

vi.mock('../src/runtime/utils/exportRows', async importOriginal => ({
  ...await importOriginal<typeof import('../src/runtime/utils/exportRows')>(),
  downloadBlob: mockDownloadBlob,
}))

const { useMongocampExportAll } = await import('../src/runtime/composables/useMongocampExportAll')

// the server streams: the body arrives in chunks
function serve(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text)
  mockExportDocumentsRaw.mockImplementation(async () => ({
    raw: new Response(new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize))
        controller.close()
      },
    })),
  }))
}

const NDJSON = '{"_id":"a","n":1}\n{"_id":"b","n":2}\n{"big":9007199254740993,"_id":"c"}\n'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exportCollection', () => {
  it('asks the server for the file with the filter, sort, fields and limit, and hands the blob to the browser', async () => {
    serve(NDJSON)
    const { exportCollection } = useMongocampExportAll()

    const result = await exportCollection({ collection: 'customers', format: 'ndjson', filter: 'a:1', sort: ['-n'], projection: ['n'], maxRows: 10, filename: 'all.ndjson' })

    expect(mockExportDocumentsRaw).toHaveBeenCalledTimes(1)
    expect(mockExportDocumentsRaw.mock.calls[0]![0]).toEqual({ collectionName: 'customers', format: 'ndjson', filter: 'a:1', sort: ['-n'], projection: ['n'], limit: 10 })
    expect(mockDownloadBlob).toHaveBeenCalledWith('all.ndjson', result.blob)
    expect(result).toMatchObject({ filename: 'all.ndjson', mimeType: 'application/x-ndjson', format: 'ndjson', bytes: NDJSON.length, documents: 3, incomplete: false })
  })

  it('keeps the file exactly as the server wrote it — a long beyond 2^53 keeps every digit', async () => {
    serve(NDJSON)
    const result = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'ndjson', download: false })

    expect(await result.blob.text()).toBe(NDJSON)
    expect(mockDownloadBlob).not.toHaveBeenCalled()
  })

  it('has no cap: nothing is sent as a limit unless asked, and an empty projection or filter is left out', async () => {
    serve('[]')
    await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', filter: '  ', sort: [], projection: [], download: false })

    expect(mockExportDocumentsRaw.mock.calls[0]![0]).toEqual({ collectionName: 'c', format: 'json', filter: undefined, sort: undefined, projection: undefined, limit: undefined })
  })

  it('takes `columns` as the projection of a CSV when no projection is given', async () => {
    serve('b,a\r\n2,1\r\n')
    await useMongocampExportAll().exportCollection({ collection: 'c', format: 'csv', columns: ['b', 'a'], download: false })

    expect(mockExportDocumentsRaw.mock.calls[0]![0].projection).toEqual(['b', 'a'])
  })

  it('reports progress per chunk: bytes and lines', async () => {
    serve(NDJSON, 10)
    const seen: Array<{ bytes: number, lines: number }> = []
    await useMongocampExportAll().exportCollection({ collection: 'c', format: 'ndjson', download: false, onProgress: p => seen.push(p) })

    expect(seen.length).toBeGreaterThan(2)
    expect(seen.at(-1)).toEqual({ bytes: NDJSON.length, lines: 3 })
    expect(seen.map(p => p.bytes)).toEqual([...seen.map(p => p.bytes)].sort((a, b) => a - b))
  })

  it('counts a last line without a line break', async () => {
    serve('{"a":1}\n{"a":2}')
    const result = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'ndjson', download: false })

    expect(result.documents).toBe(2)
  })

  describe('a file the server cut short (it ends a failing stream with a normal 200)', () => {
    it('JSON must end with a closing bracket', async () => {
      serve('[{"a":1},{"a":2}]\n')
      expect(await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', expected: 2, download: false })).toMatchObject({ incomplete: false, documents: 2 })

      serve('[{"a":1},{"a"')
      expect(await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', expected: 2, download: false })).toMatchObject({ incomplete: true, documents: undefined })
    })

    it('NDJSON must hold the expected number of documents (capped by maxRows)', async () => {
      serve('{"a":1}\n{"a":2}\n')
      const { exportCollection } = useMongocampExportAll()
      expect((await exportCollection({ collection: 'c', format: 'ndjson', expected: 5, download: false })).incomplete).toBe(true)
      expect((await exportCollection({ collection: 'c', format: 'ndjson', expected: 5, maxRows: 2, download: false })).incomplete).toBe(false)
      expect((await exportCollection({ collection: 'c', format: 'ndjson', download: false })).incomplete).toBe(false) // nothing expected, nothing to compare
    })

    it('CSV must hold a header and at least the expected number of lines', async () => {
      serve('a,b\r\n1,2\r\n')
      const { exportCollection } = useMongocampExportAll()
      expect(await exportCollection({ collection: 'c', format: 'csv', expected: 1, download: false })).toMatchObject({ incomplete: false, documents: 1 })
      expect((await exportCollection({ collection: 'c', format: 'csv', expected: 3, download: false })).incomplete).toBe(true)
    })
  })

  it('refuses a filter that would not fit in the URL before any request', async () => {
    const failure = await useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', filter: `name:(${'x'.repeat(2000)})`, download: false }).catch(e => e)

    expect(failure.name).toBe('FilterTooLongError')
    expect(mockExportDocumentsRaw).not.toHaveBeenCalled()
  })

  it('rejects with the abort and downloads nothing when aborted', async () => {
    mockExportDocumentsRaw.mockImplementation(async (_request: unknown, init: { signal: AbortSignal }) => {
      throw Object.assign(new Error('aborted'), { name: init.signal.aborted ? 'AbortError' : 'Error' })
    })
    const controller = new AbortController()
    controller.abort()

    await expect(useMongocampExportAll().exportCollection({ collection: 'c', format: 'json', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mockDownloadBlob).not.toHaveBeenCalled()
  })
})
