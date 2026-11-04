import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, UChart, USelect } from '#components'
import MongocampCollectionCharts from '../../src/runtime/components/MongocampCollectionCharts.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const mockAggregateRaw = vi.fn()

mockNuxtImport('useMongocampApi', () => () => ({ collectionApi: { aggregateRaw: mockAggregateRaw } }))

type Request = { mongoAggregateRequest: { pipeline: Array<{ stage: string, value: unknown }> }, rowsPerPage?: number, page?: number }
const response = (rows: unknown, total?: number) => ({ raw: { headers: { get: (n: string) => (n === 'x-pagination-count-rows' ? String(total ?? (rows as unknown[]).length) : null) } }, value: () => Promise.resolve(rows) })
const isSample = (r: Request) => r.mongoAggregateRequest.pipeline[0]?.stage === '$sample'
const chartCalls = () => mockAggregateRaw.mock.calls.filter(c => !isSample(c[0]))
const chartPipeline = (call = 0) => chartCalls()[call]![0].mongoAggregateRequest.pipeline

// `sample` answers the type detection, `chart` answers the chart's own aggregation
function serve(sample: unknown[], chart: (r: Request) => unknown, total?: number) {
  mockAggregateRaw.mockImplementation(async (r: Request) => (isSample(r) ? response(sample) : response(chart(r), total)))
}

beforeEach(() => {
  vi.resetAllMocks()
})

async function mountChart(props: Record<string, unknown> = {}) {
  const component = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampCollectionCharts, { collectionName: 'orders', field: 'cat', ...props })) }), { route: '/' })
  await wait()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountChart>>
const chart = (c: Mounted) => c.findComponent(UChart)
const propsOf = (c: Mounted) => chart(c).props() as { data: unknown, categories: unknown, type: string, index: string, legend: boolean, ariaLabel: string, ariaDescription: string }
const dataOf = (c: Mounted) => propsOf(c).data

const sampleOf = (field: string, values: unknown[]) => values.map(v => ({ [field]: v }))

describe('values chart (text and true/false)', () => {
  it('draws the most common values as bars with the counts', async () => {
    serve(sampleOf('cat', ['a', 'b', 'a']), () => [{ _id: 'a', count: 45 }, { _id: 'b', count: 44 }, { _id: null, count: 3 }], 14)
    const c = await mountChart()

    expect(chartPipeline()).toEqual([{ stage: '$group', value: { _id: '$cat', count: { $sum: 1 } } }, { stage: '$sort', value: { count: -1, _id: 1 } }])
    expect(chartCalls()[0]![0].rowsPerPage).toBe(10)
    const props = propsOf(c)
    expect(props).toMatchObject({ type: 'bar', index: 'label', legend: false })
    expect(props.data).toEqual([{ label: 'a', count: 45 }, { label: 'b', count: 44 }, { label: '(none)', count: 3 }])
    expect(props.categories).toEqual([{ key: 'count', label: 'Documents' }])
    // always visible, also where the Tailwind-only `in-data-measured` variant does not exist (the UnoCSS preset)
    expect((chart(c).props() as { ui: unknown }).ui).toEqual({ base: 'opacity-100' })
    // falls back to the primary colour when the theme has no chart colours
    expect((chart(c).props() as { colors: string[] }).colors).toEqual(['var(--ui-chart-1, var(--ui-primary, #16a34a))'])
    expect(c.text()).toContain('Most common values')
    expect(c.find('[data-test="chart-note"]').text()).toBe('The 3 most common of 14 values.')
  })

  it('says all values when they fit', async () => {
    serve(sampleOf('cat', ['a']), () => [{ _id: 'a', count: 5 }], 1)
    const c = await mountChart()
    expect(c.find('[data-test="chart-note"]').text()).toBe('All 1 values.')
  })

  it('describes the chart for a screen reader and offers the same numbers as a table', async () => {
    serve(sampleOf('cat', ['a']), () => [{ _id: 'a', count: 45 }, { _id: 'b', count: 44 }], 2)
    const c = await mountChart()
    expect(propsOf(c).ariaLabel).toBe('Most common values: cat')
    expect(propsOf(c).ariaDescription).toBe('2 bars; the highest is a with 45 documents.')
    const rows = c.findAll('[data-test="chart-table"] tbody tr').map(r => r.text())
    expect(rows).toEqual(['a45', 'b44'])
  })

  it('charts true/false fields the same way and a nested field by its path', async () => {
    serve(sampleOf('flag', [true, false, true]), () => [{ _id: false, count: 400 }, { _id: true, count: 200 }], 2)
    const c = await mountChart({ field: 'flag' })
    expect(dataOf(c)).toEqual([{ label: 'false', count: 400 }, { label: 'true', count: 200 }])

    mockAggregateRaw.mockClear()
    serve([{ a: { b: 'x' } }], () => [{ _id: 'x', count: 1 }])
    await mountChart({ field: 'a.b' })
    expect(chartPipeline()[0]!.value).toMatchObject({ _id: '$a.b' })
  })

  it('honours top', async () => {
    serve(sampleOf('cat', ['a']), () => [], 0)
    await mountChart({ top: 5 })
    expect(chartCalls()[0]![0].rowsPerPage).toBe(5)
  })
})

describe('date chart', () => {
  const dates = sampleOf('when', ['2026-01-02T03:04:05Z', '2026-02-02T03:04:05Z'])

  it('counts documents per month, only real dates, and re-runs per year or day when the unit changes', async () => {
    serve(dates, () => [{ _id: '2026-01', count: 4 }, { _id: '2026-02', count: 6 }], 2)
    const c = await mountChart({ field: 'when' })
    expect(chartPipeline()).toEqual([
      { stage: '$match', value: { when: { $type: 'date' } } },
      { stage: '$group', value: { _id: { $dateToString: { format: '%Y-%m', date: '$when' } }, count: { $sum: 1 } } },
      { stage: '$sort', value: { _id: 1 } },
    ])
    expect(c.text()).toContain('Documents over time')
    expect(propsOf(c).ariaDescription).toBe('2 periods from 2026-01 to 2026-02; the highest is 2026-02 with 6 documents.')

    mockAggregateRaw.mockClear()
    serve(dates, () => [{ _id: '2026', count: 10 }], 1)
    c.findAllComponents(USelect).find(s => s.html().includes('aria-label="Per"'))!.vm.$emit('update:modelValue', 'year')
    await wait()
    expect(JSON.stringify(chartPipeline())).toContain('"%Y"')
    expect(mockAggregateRaw.mock.calls.filter(call => isSample(call[0]))).toHaveLength(0) // the kind is remembered, only the aggregation runs again
    expect(dataOf(c)).toEqual([{ label: '2026', count: 10 }])
  })

  it('draws bars for a few periods and an area chart for many', async () => {
    serve(dates, () => Array.from({ length: 36 }, (_, i) => ({ _id: `p${i}`, count: i })), 36)
    expect(propsOf(await mountChart({ field: 'when' })).type).toBe('bar')
    serve(dates, () => Array.from({ length: 37 }, (_, i) => ({ _id: `p${i}`, count: i })), 37)
    expect(propsOf(await mountChart({ field: 'when' })).type).toBe('area')
  })

  it('says when periods were cut', async () => {
    serve(dates, () => Array.from({ length: 100 }, (_, i) => ({ _id: `p${i}`, count: 1 })), 250)
    const c = await mountChart({ field: 'when' })
    expect(c.find('[data-test="chart-note"]').text()).toBe('The first 100 of 250 periods are shown.')
  })
})

describe('number chart', () => {
  it('draws equal-count ranges, keeping every digit of a huge number', async () => {
    serve(sampleOf('price', [1, 2, 3]), () => [{ _id: { min: 1.5, max: 85.5 }, count: 59 }, { _id: { min: '9007199254740993', max: '9007199254741193' }, count: 2 }], 2)
    const c = await mountChart({ field: 'price', buckets: 6 })
    expect(chartPipeline()).toEqual([{ stage: '$match', value: { price: { $type: 'number' } } }, { stage: '$bucketAuto', value: { groupBy: '$price', buckets: 6 } }])
    expect(dataOf(c)).toEqual([{ label: '1.5–85.5', count: 59 }, { label: '9007199254740993–9007199254741193', count: 2 }])
    expect(c.find('[data-test="chart-note"]').text()).toContain('Each range holds about the same number of documents')
    expect(c.text()).toContain('Distribution of numbers')
  })
})

describe('when there is no chart', () => {
  it('explains a field that cannot be charted (an array, an object)', async () => {
    serve([{ tags: ['a'] }, { tags: ['b'] }], () => [])
    const c = await mountChart({ field: 'tags' })
    expect(c.find('[data-test="chart-unsupported"]').text()).toContain('There is no chart for a field of type array')
    expect(chartCalls()).toHaveLength(0)
    expect(c.findComponent(UChart).exists()).toBe(false)
  })

  it('says when the field is not in the sample', async () => {
    serve([{ a: 1 }], () => [])
    const c = await mountChart({ field: 'ghost' })
    expect(c.find('[data-test="chart-unknown"]').text()).toContain('ghost was not found')
  })

  it('refuses a field name it cannot write as a path, without asking the server', async () => {
    serve([{ a$b: 'x' }], () => [])
    const c = await mountChart({ field: 'a$b', kind: 'values' })
    expect(c.find('[data-test="chart-invalid"]').exists()).toBe(true)
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })

  it('says when no document has a value of that kind', async () => {
    serve(sampleOf('when', ['2026-01-02T03:04:05Z']), () => [], 0)
    const c = await mountChart({ field: 'when' })
    expect(c.find('[data-test="chart-empty"]').text()).toContain('No documents have a value of this kind in when')
  })

  it('a forced kind skips the sample', async () => {
    serve([], () => [{ _id: 'x', count: 1 }])
    const c = await mountChart({ field: 'cat', kind: 'values' })
    expect(mockAggregateRaw.mock.calls.filter(call => isSample(call[0]))).toHaveLength(0)
    expect(dataOf(c)).toEqual([{ label: 'x', count: 1 }])
  })
})

describe('loading and failing', () => {
  it('shows the server message and tries again', async () => {
    mockAggregateRaw.mockImplementation(async (r: Request) => {
      if (isSample(r)) return response(sampleOf('cat', ['a']))
      throw Object.assign(new Error('x'), { response: new Response(JSON.stringify({ code: 40324, msg: 'boom from mongo' }), { status: 500 }) })
    })
    const c = await mountChart()
    expect(c.find('[data-test="chart-error"]').text()).toContain('boom from mongo')

    serve(sampleOf('cat', ['a']), () => [{ _id: 'a', count: 1 }])
    await c.findAll('button').find(b => b.text() === 'Try again')!.trigger('click')
    await wait()
    expect(c.find('[data-test="chart-error"]').exists()).toBe(false)
    expect(chart(c).exists()).toBe(true)
  })

  it('shows a loading note while it asks', async () => {
    let release!: () => void
    mockAggregateRaw.mockImplementation((r: Request) => new Promise((resolve) => {
      release = () => resolve(isSample(r) ? response(sampleOf('cat', ['a'])) : response([{ _id: 'a', count: 1 }]))
    }))
    const c = await mountChart()
    expect(c.find('[data-test="chart-loading"]').exists()).toBe(true)
    release()
    await wait()
  })

  it('follows a changed field and ignores a slower answer for the old one', async () => {
    const field = shallowRef('cat')
    const resolvers: Array<() => void> = []
    mockAggregateRaw.mockImplementation((r: Request) => new Promise((resolve) => {
      if (isSample(r)) return resolve(response([{ cat: 'a', other: 'b' }]))
      const pipeline = r.mongoAggregateRequest.pipeline
      const name = String((pipeline[0]!.value as { _id: string })._id)
      resolvers.push(() => resolve(response([{ _id: name, count: 1 }])))
    }))
    const Host = defineComponent({ setup: () => () => h(UApp, () => h(MongocampCollectionCharts, { collectionName: 'orders', field: field.value })) })
    const c = await mountSuspended(Host, { route: '/' })
    await wait()
    field.value = 'other'
    await wait()
    expect(resolvers).toHaveLength(2)
    resolvers[1]!() // the new one answers first
    await wait()
    resolvers[0]!() // the old one is late
    await wait()
    expect((c.findComponent(UChart).props() as { data: unknown }).data).toEqual([{ label: '$other', count: 1 }])
  })

  it('cancels a running request when it goes away', async () => {
    let signal: AbortSignal | undefined
    mockAggregateRaw.mockImplementation((r: Request, init: { signal: AbortSignal }) => {
      if (isSample(r)) return Promise.resolve(response(sampleOf('cat', ['a'])))
      signal = init.signal
      return new Promise(() => {})
    })
    const c = await mountChart()
    expect(signal).toBeDefined()
    expect(signal!.aborted).toBe(false)
    c.unmount()
    await wait()
    expect(signal!.aborted).toBe(true)
  })
})
