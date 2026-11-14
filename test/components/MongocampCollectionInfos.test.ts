import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import MongocampCollectionInfos from '../../src/runtime/components/MongocampCollectionInfos.vue'

enableAutoUnmount(afterEach)

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const mockGetCollectionInformation = vi.fn()
const mockListDocuments = vi.fn()
const mockListIndices = vi.fn()
const mockAggregateRaw = vi.fn()
// the index panel asks for `$indexStats` through the same `aggregateRaw`; it has its own mock so the statistics tests
// below keep counting only their own sampling calls
const mockIndexStats = vi.fn()
const isIndexStatsCall = (request: { mongoAggregateRequest?: { pipeline?: Array<{ stage?: string }> } }) =>
  request.mongoAggregateRequest?.pipeline?.[0]?.stage === '$indexStats'
const mockGetJsonSchema = vi.fn()
const mockGetSchemaAnalysis = vi.fn()
const mockDownload = vi.hoisted(() => vi.fn())

vi.mock('../../src/runtime/utils/exportRows', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/runtime/utils/exportRows')>(),
  downloadTextFile: mockDownload,
}))

mockNuxtImport('useMongocampApi', () => {
  return () => ({
    collectionApi: { getCollectionInformation: mockGetCollectionInformation, aggregateRaw: (request: Parameters<typeof isIndexStatsCall>[0], init?: unknown) => (isIndexStatsCall(request) ? mockIndexStats(request, init) : mockAggregateRaw(request, init)), getJsonSchema: mockGetJsonSchema, getSchemaAnalysis: mockGetSchemaAnalysis },
    documentApi: { listDocuments: mockListDocuments },
    indexApi: { indexDetails: mockListIndices },
  })
})

function rawResponse(rows: unknown) {
  return { raw: { headers: { get: () => null } }, value: () => Promise.resolve(rows) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCollectionInformation.mockResolvedValue({ count: 1000, size: 2048, storageSize: 4096, avgObjSize: 20, nindexes: 1, totalIndexSize: 1024, indexSizes: {} })
  mockListDocuments.mockResolvedValue([{ _id: 'a', name: 'x' }])
  mockListIndices.mockResolvedValue([])
  mockAggregateRaw.mockResolvedValue(rawResponse([]))
  mockIndexStats.mockResolvedValue(rawResponse([]))
  mockGetJsonSchema.mockResolvedValue({ $schema: 'http://json-schema.org/draft-07/schema#', $ref: '#/definitions/people', definitions: { people: { type: 'object' } } })
})

async function mountInfos() {
  const component = await mountSuspended(withUApp(MongocampCollectionInfos), { route: '/', props: { collectionName: 'people' } })
  await wait()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountInfos>>

// the statistics are the last table on the page (the schema and index tables come first)
const statsRows = (component: Mounted) => component.findAll('table').filter(t => !t.attributes('data-test'))!.at(-1)!.findAll('tbody tr')

const analyzeButton = (component: Mounted) => component.findAll('button').find(b => b.text() === 'Analyze fields')!

const sample = [
  { _id: 'a1', name: 'Ann', status: 'active', born: '1990-01-01T00:00:00Z', address: { city: 'Paris' } },
  { _id: 'a2', name: 'Bob', status: 'active', born: '1985-05-05T00:00:00Z', address: { city: 'Rome' } },
  { _id: 'a3', name: 'Cy', status: 'inactive', born: null },
  { _id: 'a4', name: 'Di', status: 'active' },
]

describe('MongocampCollectionInfos — page contract', () => {
  it('exposes refresh(), which asks for the numbers, the sample and the indexes again', async () => {
    const exposed: { current: { refresh?: () => Promise<unknown> } | null } = { current: null }
    await mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(MongocampCollectionInfos, { collectionName: 'people', ref: (el: unknown) => { exposed.current = el as typeof exposed.current } })),
    }), { route: '/' })
    await wait()
    const before = { info: mockGetCollectionInformation.mock.calls.length, docs: mockListDocuments.mock.calls.length, indexes: mockListIndices.mock.calls.length }

    await exposed.current!.refresh!()
    await wait()

    expect(mockGetCollectionInformation.mock.calls.length).toBeGreaterThan(before.info)
    expect(mockListDocuments.mock.calls.length).toBe(before.docs + 1)
    expect(mockListIndices.mock.calls.length).toBeGreaterThan(before.indexes)
  })
})

describe('MongocampCollectionInfos — field statistics', () => {
  it('offers the statistics on demand and does not sample anything until asked', async () => {
    const component = await mountInfos()

    expect(component.text()).toContain('Field statistics')
    expect(component.text()).toContain('from a random sample of documents')
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })

  it('samples with $sample at the chosen size in one page — never through the server\'s schema analysis', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse(sample))
    const component = await mountInfos()

    component.findAllComponents(USelect).find(s => s.html().includes('aria-label="Sample size"'))!.vm.$emit('update:modelValue', 100)
    await wait()
    await analyzeButton(component).trigger('click')
    await wait()

    expect(mockAggregateRaw).toHaveBeenCalledTimes(1)
    expect(mockAggregateRaw.mock.calls[0]![0]).toMatchObject({
      collectionName: 'people',
      mongoAggregateRequest: { pipeline: [{ stage: '$sample', value: { size: 100 } }], allowDiskUse: false },
      rowsPerPage: 100,
      page: 1,
    })
  })

  it('charts how often each field is present, sparsest first, from the same sample', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse(sample))
    const component = await mountInfos()
    expect(component.find('[data-testid="presence-chart"]').exists()).toBe(false)

    await analyzeButton(component).trigger('click')
    await wait()

    const chart = component.find('[data-testid="presence-chart"]')
    expect(chart.exists()).toBe(true)
    expect(chart.attributes('open')).toBeUndefined()
    const rows = chart.findAll('[data-test="chart-table"] tbody tr').map(tr => tr.findAll('td').map(td => td.text()))
    expect(rows[0]).toEqual(['address', '50%'])
    expect(rows.at(-1)).toEqual(['status', '100%']) // ties by path
    expect(mockAggregateRaw).toHaveBeenCalledTimes(1)
  })

  it('shows each field with its types, how often it is present and its common values', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse(sample))
    const component = await mountInfos()

    await analyzeButton(component).trigger('click')
    await wait()

    expect(component.text()).toContain('4 of 1000 documents sampled')
    expect(component.text()).toContain('Computed from a random sample, not from the whole collection.')
    const rows = statsRows(component)
    const cells = (path: string) => rows.find(r => r.findAll('td')[0]?.text() === path)?.findAll('td').map(td => td.text())
    expect(cells('_id')?.slice(1, 3)).toEqual(['string', '100%'])
    expect(cells('status')).toEqual(['status', 'string', '100%', 'active (3), inactive (1)'])
    expect(cells('born')?.slice(1, 3)).toEqual(['date 67%null 33%', '75%'])
    expect(cells('address')?.slice(1, 3)).toEqual(['object', '50%'])
    expect(cells('address.city')?.slice(1, 3)).toEqual(['string', '50%'])
    expect(rows.map(r => r.findAll('td')[0]!.text())).toEqual(['_id', 'address', 'address.city', 'born', 'name', 'status'])
  })

  it('shows an empty state for a collection without documents', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse([]))
    const component = await mountInfos()

    await analyzeButton(component).trigger('click')
    await wait()

    expect(component.text()).toContain('No documents to analyze')
  })

  it('says it failed, with only the MongoDB message, and can retry', async () => {
    const body = { code: -1, msg: 'Command failed with error 2 (BadValue): \'bad sample size\' on server 173.249.2.248:5455. The full response is {"ok": 0.0}' }
    mockAggregateRaw.mockRejectedValueOnce(Object.assign(new Error('Response returned an error code'), {
      name: 'ResponseError',
      response: new Response(JSON.stringify(body), { status: 500 }),
    }))
    const component = await mountInfos()

    await analyzeButton(component).trigger('click')
    await wait()

    expect(component.text()).toContain('The field statistics could not be loaded')
    expect(component.text()).toContain('bad sample size')
    expect(component.text()).not.toMatch(/173\.249|5455/)

    mockAggregateRaw.mockResolvedValue(rawResponse(sample))
    await component.findAll('button').find(b => b.text() === 'Retry')?.trigger('click')
    await wait()

    expect(component.text()).toContain('4 of 1000 documents sampled')
    expect(component.text()).not.toContain('could not be loaded')
  })

  it('gives the same result when asked again — nothing accumulates (the server\'s own analysis grows with every call)', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse(sample))
    const component = await mountInfos()

    await analyzeButton(component).trigger('click')
    await wait()
    const first = statsRows(component).length
    await analyzeButton(component).trigger('click')
    await wait()
    await analyzeButton(component).trigger('click')
    await wait()

    expect(statsRows(component)).toHaveLength(first)
    expect(first).toBe(6)
  })

  it('drops the statistics when the collection changes, because they describe one collection', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse(sample))
    const collection = ref('people')
    const Host = defineComponent({
      setup: () => () => h(UApp, () => h(MongocampCollectionInfos, { collectionName: collection.value })),
    })
    const component = await mountSuspended(Host, { route: '/' })
    await wait()
    await component.findAll('button').find(b => b.text() === 'Analyze fields')?.trigger('click')
    await wait()
    expect(component.text()).toContain('4 of 1000 documents sampled')

    collection.value = 'orders'
    await nextTick()
    await wait()

    expect(component.text()).not.toContain('documents sampled')
  })

  it('ignores a sample that arrives after the collection was switched', async () => {
    let resolveLate: (value: unknown) => void = () => {}
    mockAggregateRaw.mockReturnValueOnce(new Promise((resolve) => {
      resolveLate = resolve
    }))
    const collection = ref('people')
    const Host = defineComponent({
      setup: () => () => h(UApp, () => h(MongocampCollectionInfos, { collectionName: collection.value })),
    })
    const component = await mountSuspended(Host, { route: '/' })
    await wait()
    await component.findAll('button').find(b => b.text() === 'Analyze fields')?.trigger('click')

    collection.value = 'orders'
    await nextTick()
    await wait()
    resolveLate(rawResponse(sample))
    await wait()

    expect(component.text()).not.toContain('documents sampled')
  })
})

// the viewer is a teleported UModal, so it is queried through document.body
const body = () => new DOMWrapper(document.body)
const schemaButton = (component: Mounted) => component.findAll('button').find(b => b.text() === 'JSON schema')!
const footerButton = (label: string) => body().findAll('button').find(b => b.text() === label)!

describe('MongocampCollectionInfos — analyze all documents (server analysis)', () => {
  const type = (fieldType: string, count: number) => ({ fieldType, count, percentageOfParent: 1 })
  const analysis = {
    count: 1000,
    sample: 1000,
    percentageOfAnalysed: 1,
    fields: [
      { name: '_id', fullName: '_id', count: 1000, percentageOfParent: 1, fieldTypes: [type('objectId', 1000)] },
      { name: 'age', fullName: 'age', count: 600, percentageOfParent: 0.6, fieldTypes: [type('long', 600)] },
      { name: 'items', fullName: 'items', count: 500, percentageOfParent: 0.5, fieldTypes: [type('array', 500)], subFields: [{ name: '[array element]', fullName: 'items.[]', count: 1000, percentageOfParent: 2, fieldTypes: [type('object', 1000)], subFields: [{ name: 'sku', fullName: 'items.[].sku', count: 1000, percentageOfParent: 1, fieldTypes: [type('string', 1000)] }] }] },
    ],
  }
  const allButton = (component: Mounted) => component.findAll('button').find(b => b.text() === 'Analyze all documents')!

  it('offers it next to the sample button and asks the server for nothing until clicked', async () => {
    const component = await mountInfos()

    expect(allButton(component)).toBeDefined()
    expect(allButton(component).attributes('disabled')).toBeUndefined()
    expect(mockGetSchemaAnalysis).not.toHaveBeenCalled()
  })

  it('analyses every document through the server and shows the same table, labelled as complete', async () => {
    mockGetSchemaAnalysis.mockResolvedValueOnce(analysis)
    const component = await mountInfos()

    await allButton(component).trigger('click')
    await wait()

    expect(mockGetSchemaAnalysis).toHaveBeenCalledTimes(1)
    expect(mockGetSchemaAnalysis.mock.calls[0]![0]).toEqual({ collectionName: 'people', sampleSize: 1000, deepth: 3 })
    expect(component.text()).toContain('All 1000 documents analyzed')
    expect(component.text()).toContain('Analyzed by the server over all 1000 documents')
    expect(statsRows(component).map(tr => tr.findAll('td')[0]!.text())).toEqual(['_id', 'age', 'items', 'items[].sku'])
    // the sample was not drawn
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })

  it('shows the share of documents per field, with no common values (the server lists none)', async () => {
    mockGetSchemaAnalysis.mockResolvedValueOnce(analysis)
    const component = await mountInfos()

    await allButton(component).trigger('click')
    await wait()

    const rows = statsRows(component)
    expect(rows[1]!.text()).toContain('age')
    expect(rows[1]!.text()).toContain('60%')
    expect(rows[3]!.text()).toContain('50%') // items[].sku: half the documents, not 100% because of the element count
    expect(rows[1]!.findAll('td')[3]!.text()).toBe('—')
  })

  it('is disabled for an empty collection and above the document limit, and says why', async () => {
    mockGetCollectionInformation.mockResolvedValue({ count: 0, size: 0, storageSize: 0, avgObjSize: 0, nindexes: 1, totalIndexSize: 0, indexSizes: {} })
    const empty = await mountInfos()
    expect(allButton(empty).attributes('disabled')).toBeDefined()

    mockGetCollectionInformation.mockResolvedValue({ count: 250_000, size: 1, storageSize: 1, avgObjSize: 1, nindexes: 1, totalIndexSize: 1, indexSizes: {} })
    const huge = await mountInfos()
    expect(allButton(huge).attributes('disabled')).toBeDefined()
    expect(allButton(huge).attributes('title')).toContain('More than 200000 documents')
  })

  it('shows a clear message when the analysis takes too long, and Retry runs the server analysis again', async () => {
    mockGetSchemaAnalysis.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    mockGetSchemaAnalysis.mockResolvedValueOnce(analysis)
    const component = await mountInfos()

    await allButton(component).trigger('click')
    await wait()
    expect(component.text()).toContain('The analysis took too long')

    await component.findAll('button').find(b => b.text() === 'Retry')!.trigger('click')
    await wait()

    expect(mockGetSchemaAnalysis).toHaveBeenCalledTimes(2)
    expect(mockAggregateRaw).not.toHaveBeenCalled() // Retry repeated the server analysis, not the sample
    expect(component.text()).toContain('All 1000 documents analyzed')
  })

  it('shows another failure with the server message', async () => {
    mockGetSchemaAnalysis.mockRejectedValueOnce(Object.assign(new Error('Response returned an error code'), { name: 'ResponseError', response: new Response(JSON.stringify({ code: -1, msg: 'analysis failed' }), { status: 500 }) }))
    const component = await mountInfos()

    await allButton(component).trigger('click')
    await wait()

    expect(component.text()).toContain('The field statistics could not be loaded')
    expect(component.text()).toContain('analysis failed')
  })

  it('switching back to the sample replaces the server result, and the sample button stays the default', async () => {
    mockGetSchemaAnalysis.mockResolvedValueOnce(analysis)
    mockAggregateRaw.mockResolvedValueOnce(rawResponse(sample))
    const component = await mountInfos()

    await allButton(component).trigger('click')
    await wait()
    expect(component.text()).toContain('All 1000 documents analyzed')

    await analyzeButton(component).trigger('click')
    await wait()

    expect(component.text()).not.toContain('All 1000 documents analyzed')
    expect(component.text()).toContain('Computed from a random sample')
  })
})

describe('MongocampCollectionInfos — JSON schema viewer', () => {
  it('does not load the schema until the viewer is opened', async () => {
    await mountInfos()

    expect(mockGetJsonSchema).not.toHaveBeenCalled()
  })

  it('loads the schema for this collection on open and shows it verbatim', async () => {
    const component = await mountInfos()

    await schemaButton(component).trigger('click')
    await flushPromises()
    await wait()

    expect(mockGetJsonSchema).toHaveBeenCalledTimes(1)
    expect(mockGetJsonSchema).toHaveBeenCalledWith({ collectionName: 'people' }, { signal: expect.any(AbortSignal) })
    expect(body().find('pre').text()).toBe(JSON.stringify(await mockGetJsonSchema.mock.results[0]!.value, null, 2))
  })

  it('does not fetch again when reopened after a successful load', async () => {
    const component = await mountInfos()
    await schemaButton(component).trigger('click')
    await flushPromises()
    await wait()
    await body().find('button[aria-label="Close"]').trigger('click')
    await wait(300)

    await schemaButton(component).trigger('click')
    await wait()

    expect(mockGetJsonSchema).toHaveBeenCalledTimes(1)
  })

  it('downloads the shown schema as <collection>.schema.json', async () => {
    const component = await mountInfos()
    await schemaButton(component).trigger('click')
    await flushPromises()
    await wait()

    await footerButton('Download').trigger('click')

    expect(mockDownload).toHaveBeenCalledWith('people.schema.json', body().find('pre').text(), 'application/json')
  })

  it('copies the shown schema to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const component = await mountInfos()
    await schemaButton(component).trigger('click')
    await flushPromises()
    await wait()

    await footerButton('Copy').trigger('click')

    expect(writeText).toHaveBeenCalledWith(body().find('pre').text())
  })

  it('shows the error alert with a retry when loading fails, and retry loads it', async () => {
    mockGetJsonSchema.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'FetchError' }))
    const component = await mountInfos()

    await schemaButton(component).trigger('click')
    await flushPromises()
    await wait()

    expect(body().text()).toContain('The JSON schema could not be loaded')
    expect(footerButton('Download').attributes('disabled')).toBeDefined()

    await body().findAll('button').find(b => b.text() === 'Retry')!.trigger('click')
    await flushPromises()
    await wait()

    expect(mockGetJsonSchema).toHaveBeenCalledTimes(2)
    expect(body().find('pre').exists()).toBe(true)
  })
})
