import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCollectionApi = {
  aggregateRaw: vi.fn(),
  distinctRaw: vi.fn(),
  getFieldDetails: vi.fn(),
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
  it('sends the Lucene filter as the filter parameter, and no parameter for a blank one', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValue(rawResponse([]))
    const { runAggregation } = useMongocampAggregation()

    await runAggregation('people', [{ stage: '$count', value: 'c' }], {}, { filter: 'age:[18 TO 99]' })
    expect(mockCollectionApi.aggregateRaw.mock.calls[0]![0].filter).toBe('age:[18 TO 99]')

    await runAggregation('people', [{ stage: '$count', value: 'c' }], {}, { filter: '   ' })
    expect(mockCollectionApi.aggregateRaw.mock.calls[1]![0].filter).toBeUndefined()
  })

  it('refuses a filter that would not fit in the URL before any request', async () => {
    const failure = await useMongocampAggregation().runAggregation('people', [{ stage: '$count', value: 'c' }], {}, { filter: `name:(${'x'.repeat(2000)})` }).catch(e => e)

    expect(failure.name).toBe('FilterTooLongError')
    expect(mockCollectionApi.aggregateRaw).not.toHaveBeenCalled()
  })

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

  it('returns an empty page for a result with no rows', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([], { 'x-pagination-count-rows': '0' }))

    const result = await useMongocampAggregation().runAggregation('people', [{ stage: '$match', value: { x: 'nothing' } }], { page: 4 })

    expect(result).toEqual({ rows: [], total: 0, pages: 1, page: 4 })
  })

  it('rejects with the original error when the API fails', async () => {
    const boom = new Error('boom')
    mockCollectionApi.aggregateRaw.mockRejectedValueOnce(boom)

    await expect(useMongocampAggregation().runAggregation('people', [])).rejects.toBe(boom)
  })
})

describe('stats stages (allowStatsStages)', () => {
  const statsRow = { name: 'n_1', accesses: { ops: 4 }, host: '2797c7a9bf90:27017', ns: 'mongocamp.c' }

  it('refuses $indexStats and $collStats by default — no request is made', async () => {
    const { runAggregation } = useMongocampAggregation()

    await expect(runAggregation('c', [{ stage: '$indexStats', value: {} }])).rejects.toBeInstanceOf(ForbiddenPipelineError)
    await expect(runAggregation('c', [{ stage: '$collStats', value: { count: {} } }])).rejects.toBeInstanceOf(ForbiddenPipelineError)
    expect(mockCollectionApi.aggregateRaw).not.toHaveBeenCalled()
  })

  it('runs them on request and removes the database host and namespace from every row', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([statsRow]))

    const result = await useMongocampAggregation().runAggregation('c', [{ stage: '$indexStats', value: {} }], {}, { allowStatsStages: true })

    expect(mockCollectionApi.aggregateRaw).toHaveBeenCalledTimes(1)
    expect(result.rows).toEqual([{ name: 'n_1', accesses: { ops: 4 } }])
    expect(JSON.stringify(result)).not.toMatch(/27017|2797c7a9bf90|mongocamp\.c/)
  })

  it('still refuses every other deny-listed operator, even with the opt-in', async () => {
    const { runAggregation } = useMongocampAggregation()

    await expect(runAggregation('c', [{ stage: '$indexStats', value: {} }, { stage: '$out', value: 'x' }], {}, { allowStatsStages: true })).rejects.toBeInstanceOf(ForbiddenPipelineError)
    expect(mockCollectionApi.aggregateRaw).not.toHaveBeenCalled()
  })

  it('does not touch the rows of an ordinary aggregation: a document may have a field called host', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(rawResponse([{ _id: 'a', host: 'web-1' }]))

    const result = await useMongocampAggregation().runAggregation('c', [{ stage: '$match', value: {} }])

    expect(result.rows).toEqual([{ _id: 'a', host: 'web-1' }])
  })
})

describe('large integers', () => {
  // a real Response, like the generated client returns: its own value() would round the digits
  const textResponse = (text: string, headers: Record<string, string> = {}) => {
    const raw = new Response(text, { headers })
    return { raw, value: () => raw.json() }
  }

  it('keeps a 64-bit integer in an aggregation result exact (as its digit string)', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(textResponse('[{"_id":"a","total":9007199254740993,"small":5,"avg":2.5}]'))

    const result = await useMongocampAggregation().runAggregation('c', [])

    expect(result.rows).toEqual([{ _id: 'a', total: '9007199254740993', small: 5, avg: 2.5 }])
  })

  it('unwraps the decimal and int wrappers the server writes in a result', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(textResponse('[{"d":{"$numberDecimal":"1.50"},"i":{"$numberInt":"7"}}]'))

    expect((await useMongocampAggregation().runAggregation('c', [])).rows).toEqual([{ d: 1.5, i: 7 }])
  })

  it('keeps the pagination headers when reading the body itself', async () => {
    mockCollectionApi.aggregateRaw.mockResolvedValueOnce(textResponse('[{"a":1}]', { 'x-pagination-count-rows': '9', 'x-pagination-count-pages': '3' }))

    const result = await useMongocampAggregation().runAggregation('c', [])

    expect(result).toMatchObject({ total: 9, pages: 3 })
  })

  it('keeps a distinct value beyond 2^53 exact as text', async () => {
    mockCollectionApi.distinctRaw.mockResolvedValueOnce(textResponse('[9007199254740993,7,"x"]'))

    expect((await useMongocampAggregation().listDistinct('c', 'f')).values).toEqual(['9007199254740993', 7, 'x'])
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

  it('treats a body-less 503 from the proxy as retryable', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(503, ''))

    expect(result.kind).toBe('retryable')
    expect(result.message).toContain('unavailable')
  })

  it('shows an operator the server itself refuses (403, code 4031) like a deny-list hit, not as a missing permission', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(403, { code: 4031, msg: 'the operator $function is not allowed in an aggregation' }))

    expect(result.kind).toBe('forbidden')
    expect(result.message).toContain('"operator":"$function"')
  })

  it('shows what the server said for an invalid request (400, code 4001)', async () => {
    const result = await useMongocampAggregation().describeAggregationError(responseError(400, { code: 4001, msg: 'Expected a number at stage 2' }))

    expect(result).toEqual({ kind: 'other', message: 'Expected a number at stage 2' })
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

describe('field details', () => {
  const DETAILS = [
    { path: 'name', types: [{ type: 'string', count: 6 }] },
    { path: 'address', types: [{ type: 'object', count: 2 }] },
    { path: 'address.city', types: [{ type: 'string', count: 2 }] },
    { path: 'tags', types: [{ type: 'array', count: 1 }] },
    { path: 'tags[]', types: [{ type: 'string', count: 2 }] },
  ]

  it('asks the server for every field with its types, with the sample size and depth it was given and a timeout', async () => {
    mockCollectionApi.getFieldDetails.mockResolvedValueOnce(DETAILS)

    const result = await useMongocampAggregation().listFieldDetails('people', { sampleSize: 500, depth: 5 })

    expect(result).toBe(DETAILS)
    expect(mockCollectionApi.getFieldDetails).toHaveBeenCalledWith({ collectionName: 'people', sampleSize: 500, depth: 5 }, withAbortSignal())
  })

  it('suggests the paths a stage can name: nested ones included, array elements left out', async () => {
    mockCollectionApi.getFieldDetails.mockResolvedValueOnce(DETAILS)

    expect(await useMongocampAggregation().listFieldNames('people')).toEqual(['address', 'address.city', 'name', 'tags'])
    expect(mockCollectionApi.getFieldDetails.mock.calls[0]![0]).toEqual({ collectionName: 'people', sampleSize: undefined, depth: undefined })
  })
})
