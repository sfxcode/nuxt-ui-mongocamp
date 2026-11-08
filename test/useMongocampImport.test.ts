import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDocumentApi = { insertMany: vi.fn(), importDocuments: vi.fn() }

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ documentApi: mockDocumentApi }),
  useMongocampStorage: () => ({ value: { profile: { user: 'alice' } } }),
}))

const { useMongocampImport } = await import('../src/runtime/composables/useMongocampImport')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('importRows', () => {
  it('calls insertMany per batch with the collection, the rows and a timeout signal', async () => {
    mockDocumentApi.insertMany.mockResolvedValue({ wasAcknowledged: true })
    const { importRows } = useMongocampImport()

    const result = await importRows('people', [{ a: 1 }, { a: 2 }, { a: 3 }], { batchSize: 2 })

    expect(mockDocumentApi.insertMany).toHaveBeenCalledTimes(2)
    expect(mockDocumentApi.insertMany).toHaveBeenNthCalledWith(
      1,
      { collectionName: 'people', requestBody: [{ a: 1 }, { a: 2 }], ordered: false },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result.inserted).toBe(3)
  })

  it('stamps metadata on copies and leaves the input rows untouched', async () => {
    mockDocumentApi.insertMany.mockResolvedValue({})
    const rows = [{ a: 1 }]
    const { importRows } = useMongocampImport()

    await importRows('people', rows, { stampMetadata: true })

    const sent = mockDocumentApi.insertMany.mock.calls[0]![0].requestBody[0]
    expect(sent.metaData).toMatchObject({ createdBy: 'alice', updatedBy: 'alice' })
    expect(rows[0]).toEqual({ a: 1 })
  })

  it('treats a 400 as rejected-before-write and any other failure as possibly partial', async () => {
    mockDocumentApi.insertMany
      .mockRejectedValueOnce({ response: { status: 400 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
    const { importRows } = useMongocampImport()

    const result = await importRows('people', [{ a: 1 }, { a: 2 }], { batchSize: 1 })

    expect(result.failedBatches.map(f => [f.start, f.mayBePartial])).toEqual([[0, false], [1, true]])
  })

  it('does not call the API at all for no rows', async () => {
    const { importRows } = useMongocampImport()
    await importRows('people', [])
    expect(mockDocumentApi.insertMany).not.toHaveBeenCalled()
  })

  it('aborts the in-flight request when the caller aborts', async () => {
    const controller = new AbortController()
    mockDocumentApi.insertMany.mockImplementation((_params: unknown, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const { importRows } = useMongocampImport()

    const pending = importRows('people', [{ a: 1 }, { a: 2 }], { batchSize: 1, signal: controller.signal })
    controller.abort()
    const result = await pending

    expect(result.failedBatches).toHaveLength(1)
    expect(result).toMatchObject({ aborted: true, skipped: 1 })
  })
})

describe('importNdjson', () => {
  it('sends the file itself as the request body — nothing is read or parsed — and returns the server\'s counts', async () => {
    const answer = { read: 3, inserted: 2, failed: 1, errors: [{ index: 3, code: 4008, message: 'the line is not valid JSON' }], errorsTruncated: false }
    mockDocumentApi.importDocuments.mockResolvedValueOnce(answer)
    const file = new File(['{"a":1}\n{"a":2}\nbad\n'], 'rows.ndjson')
    const controller = new AbortController()

    const result = await useMongocampImport().importNdjson('people', file, { signal: controller.signal })

    expect(result).toBe(answer)
    expect(mockDocumentApi.importDocuments).toHaveBeenCalledTimes(1)
    const [request, init] = mockDocumentApi.importDocuments.mock.calls[0]!
    expect(request.collectionName).toBe('people')
    expect(request.body).toBe(file)
    expect(init).toEqual({ signal: controller.signal })
  })

  it('lets a refusal reach the caller (413 above the server\'s size limit)', async () => {
    const refusal = Object.assign(new Error('too big'), { response: new Response('{}', { status: 413 }) })
    mockDocumentApi.importDocuments.mockRejectedValueOnce(refusal)

    await expect(useMongocampImport().importNdjson('people', new Blob(['x']))).rejects.toBe(refusal)
  })
})
