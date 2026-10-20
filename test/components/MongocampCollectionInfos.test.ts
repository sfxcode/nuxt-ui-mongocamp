import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
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

mockNuxtImport('useMongocampApi', () => {
  return () => ({
    collectionApi: { getCollectionInformation: mockGetCollectionInformation, aggregateRaw: mockAggregateRaw },
    documentApi: { listDocuments: mockListDocuments },
    indexApi: { listIndices: mockListIndices },
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
})

async function mountInfos() {
  const component = await mountSuspended(withUApp(MongocampCollectionInfos), { route: '/', props: { collectionName: 'people' } })
  await wait()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountInfos>>

// the statistics are the last table on the page (the schema and index tables come first)
const statsRows = (component: Mounted) => component.findAll('table').at(-1)!.findAll('tbody tr')

const analyzeButton = (component: Mounted) => component.findAll('button').find(b => b.text() === 'Analyze fields')!

const sample = [
  { _id: 'a1', name: 'Ann', status: 'active', born: '1990-01-01T00:00:00Z', address: { city: 'Paris' } },
  { _id: 'a2', name: 'Bob', status: 'active', born: '1985-05-05T00:00:00Z', address: { city: 'Rome' } },
  { _id: 'a3', name: 'Cy', status: 'inactive', born: null },
  { _id: 'a4', name: 'Di', status: 'active' },
]

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
