import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDocumentApi = { searchDocumentsRaw: vi.fn() }
const mockFileApi = { listFilesRaw: vi.fn() }

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ documentApi: mockDocumentApi, fileApi: mockFileApi }),
}))

const { useMongocampFetchAll } = await import('../src/runtime/composables/useMongocampFetchAll')

// what the generated client returns: the raw Response (headers + body text) and a value() that would round big integers
const apiResponse = (rows: unknown[], total: number) => {
  const raw = new Response(JSON.stringify(rows), { headers: { 'x-pagination-count-rows': String(total) } })
  return { raw, value: () => raw.clone().json() }
}
// a collection of `n` documents served in pages
const serve = (n: number) => async ({ page, rowsPerPage }: { page: number, rowsPerPage: number }) => {
  const start = (page - 1) * rowsPerPage
  return apiResponse(Array.from({ length: Math.max(0, Math.min(rowsPerPage, n - start)) }, (_, i) => ({ _id: `id${start + i}`, i: start + i })), n)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchAllDocuments', () => {
  it('reads every page through the document list and takes the total from the pagination header', async () => {
    mockDocumentApi.searchDocumentsRaw.mockImplementation(serve(25))
    const { fetchAllDocuments } = useMongocampFetchAll()

    const result = await fetchAllDocuments('people', { pageSize: 10 })

    expect(result.rows).toHaveLength(25)
    expect(result).toMatchObject({ total: 25, truncated: false, pages: 3 })
    expect(mockDocumentApi.searchDocumentsRaw.mock.calls.map(([params]) => [params.page, params.rowsPerPage])).toEqual([[1, 10], [2, 10], [3, 10]])
  })

  it('passes the collection, filter, sort and projection on every request, with a signal', async () => {
    mockDocumentApi.searchDocumentsRaw.mockImplementation(serve(15))

    await useMongocampFetchAll().fetchAllDocuments('people', { pageSize: 10, filter: 'g:3', sort: ['name', '-age'], projection: ['_id'] })

    for (const [params, init] of mockDocumentApi.searchDocumentsRaw.mock.calls) {
      expect(params).toMatchObject({ collectionName: 'people', searchRequest: { filter: 'g:3', sort: ['name', '-age'], projection: ['_id'] } })
      expect(init).toEqual({ signal: expect.any(AbortSignal) })
    }
  })

  it('keeps integers beyond 2^53 exact (read from the response text, as { $numberLong })', async () => {
    const raw = new Response('[{"_id":"a","big":9007199254740993}]', { headers: { 'x-pagination-count-rows': '1' } })
    mockDocumentApi.searchDocumentsRaw.mockResolvedValueOnce({ raw, value: () => raw.clone().json() })

    const result = await useMongocampFetchAll().fetchAllDocuments('c')

    expect(result.rows).toEqual([{ _id: 'a', big: { $numberLong: '9007199254740993' } }])
  })

  it('honours maxRows and says it truncated', async () => {
    mockDocumentApi.searchDocumentsRaw.mockImplementation(serve(100))

    const result = await useMongocampFetchAll().fetchAllDocuments('c', { pageSize: 10, maxRows: 25 })

    expect(result.rows).toHaveLength(25)
    expect(result.truncated).toBe(true)
  })

  it('reports progress and stops on abort, also during a request', async () => {
    const controller = new AbortController()
    mockDocumentApi.searchDocumentsRaw.mockImplementation(async (params: { page: number, rowsPerPage: number }) => {
      const response = await serve(100)(params)
      if (params.page === 2) controller.abort()
      return response
    })
    const onProgress = vi.fn()

    await expect(useMongocampFetchAll().fetchAllDocuments('c', { pageSize: 10, signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onProgress).toHaveBeenCalledTimes(1) // page 2 was in flight when the abort came: nothing is reported for it
    expect(mockDocumentApi.searchDocumentsRaw).toHaveBeenCalledTimes(2)
  })

  it('hands the caller\'s signal to the request, combined with a timeout', async () => {
    mockDocumentApi.searchDocumentsRaw.mockImplementation(serve(1))
    const controller = new AbortController()

    await useMongocampFetchAll().fetchAllDocuments('c', { signal: controller.signal })

    const init = mockDocumentApi.searchDocumentsRaw.mock.calls[0]![1] as RequestInit
    expect(init.signal).not.toBe(controller.signal) // a combined signal
    controller.abort()
    expect(init.signal!.aborted).toBe(true)
  })

  it('works without a count header (falls back to short pages) and lets a request error through', async () => {
    mockDocumentApi.searchDocumentsRaw.mockImplementation(async ({ page }: { page: number }) => {
      const raw = new Response(JSON.stringify(page === 1 ? [{ a: 1 }] : []))
      return { raw, value: () => raw.json() }
    })
    expect((await useMongocampFetchAll().fetchAllDocuments('c', { pageSize: 5 })).rows).toEqual([{ a: 1 }])

    mockDocumentApi.searchDocumentsRaw.mockRejectedValueOnce(new Error('boom'))
    await expect(useMongocampFetchAll().fetchAllDocuments('c')).rejects.toThrow('boom')
  })
})

describe('fetchAllFiles', () => {
  it('reads every page of a bucket with the string sort and projection the file list takes', async () => {
    mockFileApi.listFilesRaw.mockImplementation(async ({ page, rowsPerPage }: { page: number, rowsPerPage: number }) => {
      const start = (page - 1) * rowsPerPage
      return apiResponse(Array.from({ length: Math.max(0, Math.min(rowsPerPage, 12 - start)) }, (_, i) => ({ _id: `f${start + i}`, filename: `f${start + i}.txt` })), 12)
    })

    const result = await useMongocampFetchAll().fetchAllFiles('images', { pageSize: 5, filter: 'filename:*.png', sort: '-uploadDate', projection: 'filename' })

    expect(result.rows).toHaveLength(12)
    expect(mockFileApi.listFilesRaw).toHaveBeenCalledWith(
      { bucketName: 'images', filter: 'filename:*.png', sort: '-uploadDate', projection: 'filename', page: 1, rowsPerPage: 5 },
      { signal: expect.any(AbortSignal) },
    )
    expect(mockFileApi.listFilesRaw).toHaveBeenCalledTimes(3)
  })
})
