import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCollectionApi = {
  aggregateRaw: vi.fn(),
  distinctRaw: vi.fn(),
}

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ collectionApi: mockCollectionApi }),
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}))

const { useMongocampAggregation } = await import('../src/runtime/composables/useMongocampAggregation')
const { ForbiddenPipelineError } = await import('../src/runtime/utils/aggregationErrors')

beforeEach(() => {
  vi.clearAllMocks()
})

function rawResponse(value: unknown, headers: Record<string, string> = {}) {
  return {
    raw: { headers: { get: (name: string) => headers[name] ?? null } },
    value: () => Promise.resolve(value),
  }
}

const withAbortSignal = () => expect.objectContaining({ signal: expect.any(AbortSignal) })

describe('runAggregation', () => {
  it('sends the pipeline as raw JSON with allowDiskUse (required by the server), paging and a timeout signal', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([]))
    const pipeline = [{ stage: '$match', value: { grp: 'A' } }, { stage: '$limit', value: 5 }]

    await useMongocampAggregation().runAggregation('people', pipeline, { page: 2, rowsPerPage: 25 })

    expect(mockCollectionApi.aggregateRaw).toHaveBeenCalledWith({
      collectionName: 'people',
      mongoAggregateRequest: { pipeline, allowDiskUse: false },
      rowsPerPage: 25,
      page: 2,
    }, withAbortSignal())
  })

  it('returns the rows with the totals from the pagination headers', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([{ _id: 'A', n: 1 }], {
      'x-pagination-count-rows': '1000',
      'x-pagination-count-pages': '10',
      'x-pagination-current-page': '3',
    }))

    const result = await useMongocampAggregation().runAggregation('people', [], { page: 3 })

    expect(result).toEqual({ rows: [{ _id: 'A', n: 1 }], total: 1000, pages: 10, page: 3 })
  })

  it('falls back to the row count and the requested page when the headers are missing', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([{ a: 1 }, { a: 2 }]))

    expect(await useMongocampAggregation().runAggregation('people', [])).toEqual({ rows: [{ a: 1 }, { a: 2 }], total: 2, pages: 1, page: 1 })
  })

  it('turns a non-array response into no rows and drops entries that are not objects', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse(null))
    expect((await useMongocampAggregation().runAggregation('people', [])).rows).toEqual([])

    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([{ a: 1 }, 5, null, 'x', [1]]))
    expect((await useMongocampAggregation().runAggregation('people', [])).rows).toEqual([{ a: 1 }])
  })

  it('refuses a pipeline using a forbidden operator without calling the API', async () => {
    const pipeline = [{ stage: '$addFields', value: { x: { $function: { body: 'function(){return 1}', args: [], lang: 'js' } } } }]

    const failure = await useMongocampAggregation().runAggregation('people', pipeline).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ForbiddenPipelineError)
    expect((failure as InstanceType<typeof ForbiddenPipelineError>).findings[0]).toMatchObject({ operator: '$function' })
    expect(mockCollectionApi.aggregateRaw).not.toHaveBeenCalled()
  })

  it.each(['$out', '$merge', '$lookup', '$unionWith', '$graphLookup'])('refuses %s as a stage', async (stage) => {
    await expect(useMongocampAggregation().runAggregation('people', [{ stage, value: 'x' }])).rejects.toBeInstanceOf(ForbiddenPipelineError)
    expect(mockCollectionApi.aggregateRaw).not.toHaveBeenCalled()
  })

  describe('an empty result', () => {
    const emptyResultError = (status = 500, msg = 'Index 0 out of bounds for length 0') => Object.assign(new Error('Response returned an error code'), {
      name: 'ResponseError',
      response: new Response(JSON.stringify({ code: -1, msg }), { status }),
    })

    it('is "no results", not a failure: the server answers 500 "Index 0 out of bounds for length 0" for it', async () => {
      mockCollectionApi.aggregateRaw.mockRejectedValueOnce(emptyResultError())

      const result = await useMongocampAggregation().runAggregation('people', [{ stage: '$match', value: { x: 'nothing' } }], { page: 1 })

      expect(result).toEqual({ rows: [], total: 0, pages: 0, page: 1 })
    })

    it('keeps the requested page in the empty result', async () => {
      mockCollectionApi.aggregateRaw.mockRejectedValueOnce(emptyResultError())

      expect((await useMongocampAggregation().runAggregation('people', [], { page: 4 })).page).toBe(4)
    })

    it('makes a sample of an empty collection an empty sample', async () => {
      mockCollectionApi.aggregateRaw.mockRejectedValueOnce(emptyResultError())

      expect((await useMongocampAggregation().sampleDocuments('people')).rows).toEqual([])
    })

    it('does not swallow any other server error, nor the same text with another status', async () => {
      const other = emptyResultError(500, 'Command failed with error 2 (BadValue): \'nope\' on server 10.0.0.5:27017. The full response is {}')
      mockCollectionApi.aggregateRaw.mockRejectedValueOnce(other)
      await expect(useMongocampAggregation().runAggregation('people', [])).rejects.toBe(other)

      const notFound = emptyResultError(404)
      mockCollectionApi.aggregateRaw.mockRejectedValueOnce(notFound)
      await expect(useMongocampAggregation().runAggregation('people', [])).rejects.toBe(notFound)
    })

    it('does not swallow an error that carries no response body', async () => {
      const boom = new Error('network down')
      mockCollectionApi.aggregateRaw.mockRejectedValueOnce(boom)
      await expect(useMongocampAggregation().runAggregation('people', [])).rejects.toBe(boom)
    })
  })

  it('rejects with the original error when the API fails', async () => {
    const boom = new Error('boom')
    mockCollectionApi.aggregateRaw.mockRejectedValueOnce(boom)

    await expect(useMongocampAggregation().runAggregation('people', [])).rejects.toBe(boom)
  })
})

describe('listDistinct', () => {
  it('asks for the first page of the field with the limit as page size and a timeout signal', async () => {
    mockCollectionApi.distinctRaw.mockResolvedValueOnce(rawResponse(['A', 'B'], { 'x-pagination-count-rows': '2' }))

    const result = await useMongocampAggregation().listDistinct('people', 'grp', 50)

    expect(mockCollectionApi.distinctRaw).toHaveBeenCalledWith({ collectionName: 'people', field: 'grp', rowsPerPage: 50, page: 1 }, withAbortSignal())
    expect(result).toEqual({ values: ['A', 'B'], total: 2, truncated: false })
  })

  it('keeps strings, numbers and booleans and drops null, arrays and objects', async () => {
    mockCollectionApi.distinctRaw.mockResolvedValueOnce(rawResponse(['a', 3, true, false, null, ['x', 'y'], { k: 1 }, undefined]))

    expect((await useMongocampAggregation().listDistinct('people', 'f')).values).toEqual(['a', 3, true, false])
  })

  it('says when there are more values than were fetched', async () => {
    mockCollectionApi.distinctRaw.mockResolvedValueOnce(rawResponse(['a', 'b'], { 'x-pagination-count-rows': '1000' }))

    expect(await useMongocampAggregation().listDistinct('people', 'f', 2)).toEqual({ values: ['a', 'b'], total: 1000, truncated: true })
  })

  it('treats a missing field ([null]) and a non-array answer as no values', async () => {
    mockCollectionApi.distinctRaw.mockResolvedValueOnce(rawResponse([null]))
    expect((await useMongocampAggregation().listDistinct('people', 'missing')).values).toEqual([])

    mockCollectionApi.distinctRaw.mockResolvedValueOnce(rawResponse('nope'))
    expect(await useMongocampAggregation().listDistinct('people', 'f')).toEqual({ values: [], total: 0, truncated: false })
  })
})

describe('sampleDocuments', () => {
  it('runs a $sample aggregation that returns the whole sample in one page', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([{ a: 1 }]))

    await useMongocampAggregation().sampleDocuments('people', 200)

    expect(mockCollectionApi.aggregateRaw).toHaveBeenCalledWith({
      collectionName: 'people',
      mongoAggregateRequest: { pipeline: [{ stage: '$sample', value: { size: 200 } }], allowDiskUse: false },
      rowsPerPage: 200,
      page: 1,
    }, withAbortSignal())
  })

  it('defaults to 500 and keeps the size between 1 and 1000', async () => {
    const sizeOf = (call = 0) => mockCollectionApi.aggregateRaw.mock.calls[call]![0].mongoAggregateRequest.pipeline[0].value.size
    mockCollectionApi.aggregateRaw.mockResolvedValue(rawResponse([]))
    const { sampleDocuments } = useMongocampAggregation()

    await sampleDocuments('people')
    await sampleDocuments('people', 0)
    await sampleDocuments('people', -3)
    await sampleDocuments('people', 5000)
    await sampleDocuments('people', Number.NaN)

    expect([0, 1, 2, 3, 4].map(i => sizeOf(i))).toEqual([500, 500, 1, 1000, 500])
  })
})

describe('describeAggregationError', () => {
  const failedCommand = 'Command failed with error 15959 (Location15959): \'the match filter must be an expression in an object\' on server 173.249.2.248:5455. The full response is {"ok": 0.0}'
  const responseError = (status: number, body: unknown) => Object.assign(new Error('Response returned an error code'), {
    name: 'ResponseError',
    response: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  })

  it('shows only the MongoDB message of a failed command — never the database server address', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(500, { code: -1, msg: failedCommand }))

    expect(result).toEqual({ kind: 'mongo', message: 'the match filter must be an expression in an object' })
  })

  it('treats the intermittent 405 from the proxy as retryable', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(405, 'HTTP method not allowed, supported methods: OPTIONS'))

    expect(result.kind).toBe('retryable')
  })

  it('names the refused operator for a forbidden pipeline', async () => {
    const error = new ForbiddenPipelineError([{ stageIndex: 0, operator: '$out', path: '$out' }])

    const result = await useMongocampAggregation().describeAggregationError(error)

    expect(result.kind).toBe('forbidden')
    expect(result.message).toContain('"operator":"$out"')
  })

  it('falls back to the shared error mapping for network, session and permission failures', async () => {
    const { describeAggregationError } = useMongocampAggregation()

    expect((await describeAggregationError(Object.assign(new Error('x'), { name: 'FetchError' }))).kind).toBe('network')
    expect((await describeAggregationError(responseError(401, {}))).kind).toBe('unauthorized')
    expect((await describeAggregationError(responseError(403, {}))).kind).toBe('forbidden-access')
  })

  it('does not break on an unreadable body and keeps the generic message', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(500, 'not json'))

    expect(result.kind).toBe('other')
    expect(result.message).toBe('Response returned an error code')
  })

  it('never lets a server address through, whatever the failure', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(500, { code: -1, msg: 'Timed out on server 10.0.0.5:27017. Giving up' }))

    expect(result.message).not.toMatch(/10\.0\.0\.5|27017/)
  })
})
