import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import MongocampAggregationBuilder from '../../src/runtime/components/MongocampAggregationBuilder.vue'
import { PREVIEW_DEBOUNCE_MS } from '../../src/runtime/utils/aggregationPreview'

enableAutoUnmount(afterEach)

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const body = () => new DOMWrapper(document.body)

const mockAggregateRaw = vi.fn()
const mockGetFields = vi.fn()

mockNuxtImport('useMongocampApi', () => () => ({ collectionApi: { aggregateRaw: mockAggregateRaw, getFieldDetails: mockGetFields } }))

const rawResponse = (rows: unknown) => ({ raw: { headers: { get: () => null } }, value: () => Promise.resolve(rows) })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mockAggregateRaw.mockResolvedValue(rawResponse([]))
  mockGetFields.mockResolvedValue([{ path: 'price', types: [{ type: 'double', count: 3 }] }, { path: 'grp', types: [{ type: 'string', count: 3 }] }, { path: 'when', types: [{ type: 'date', count: 3 }] }])
})

async function mountBuilder() {
  const component = await mountSuspended(withUApp(MongocampAggregationBuilder), { route: '/', props: { collectionName: 'people' } })
  await wait()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountBuilder>>

const button = (scope: { findAll: (s: string) => Array<{ text: () => string, attributes: (n: string) => string | undefined, trigger: (e: string) => Promise<void> }> }, label: string) =>
  scope.findAll('button').find(b => b.text() === label || b.attributes('aria-label') === label)
const stageTextareas = (c: Mounted) => c.findAll('textarea[aria-label^="JSON of the"]')
const stageValues = (c: Mounted) => stageTextareas(c).map(t => JSON.parse((t.element as HTMLTextAreaElement).value))
const selectByLabel = (c: Mounted, label: string) => c.findAllComponents(USelect).find(s => s.html().includes(`aria-label="${label}"`))!
const pipelineOf = (call: number) => mockAggregateRaw.mock.calls[call]![0].mongoAggregateRequest.pipeline

async function addStage(c: Mounted, type: string, text?: string) {
  selectByLabel(c, 'Stage type').vm.$emit('update:modelValue', type)
  await wait()
  await button(c, 'Add stage')!.trigger('click')
  await wait()
  if (text !== undefined) {
    await stageTextareas(c).at(-1)!.setValue(text)
    await wait()
  }
}

describe('stages added in v2', () => {
  it('adds $unwind, $addFields, $count and $bucketAuto with a starting value, and runs them', async () => {
    const c = await mountBuilder()
    for (const type of ['$unwind', '$addFields', '$count', '$bucketAuto']) await addStage(c, type)
    expect(stageValues(c).slice(1)).toEqual(['$field', { newField: '$field' }, 'count', { groupBy: '$field', buckets: 5 }])

    await button(c, 'Run')!.trigger('click')
    await wait()
    expect(pipelineOf(0)).toEqual([
      { stage: '$unwind', value: '$field' },
      { stage: '$addFields', value: { newField: '$field' } },
      { stage: '$count', value: 'count' },
      { stage: '$bucketAuto', value: { groupBy: '$field', buckets: 5 } },
    ])
  })

  it('marks a bad value of a new stage and blocks the run', async () => {
    const c = await mountBuilder()
    await addStage(c, '$count', '"a.b"')
    expect(c.text()).toContain('Use a name for the result field')
    expect(button(c, 'Run')!.attributes('disabled')).toBeDefined()

    await stageTextareas(c).at(-1)!.setValue('"total"')
    await wait()
    await addStage(c, '$bucketAuto', '{ "groupBy": "$p" }')
    expect(c.text()).toContain('$bucketAuto needs groupBy and a whole number of buckets')
  })

  it('still refuses a denied operator hidden in $addFields', async () => {
    const c = await mountBuilder()
    await addStage(c, '$addFields', '{ "x": { "$function": { "body": "x", "args": [], "lang": "js" } } }')
    expect(c.text()).toContain('$function is not allowed')
    expect(button(c, 'Run')!.attributes('disabled')).toBeDefined()
  })
})

describe('preview after a stage', () => {
  const previewButton = (c: Mounted, index = 0) => c.findAll('button').filter(b => b.text() === 'Preview after this stage' || b.text() === 'Hide preview')[index]!

  it('makes no request until it is opened, then runs the stages up to this one cut by a small limit', async () => {
    const c = await mountBuilder()
    await stageTextareas(c)[0]!.setValue('{ "price": { "$gte": 10 } }')
    await wait()
    expect(mockAggregateRaw).not.toHaveBeenCalled()

    mockAggregateRaw.mockResolvedValue(rawResponse([{ _id: 'a', price: 20 }, { _id: 'b', price: 30 }]))
    await previewButton(c).trigger('click')
    await wait()

    expect(mockAggregateRaw).toHaveBeenCalledTimes(1)
    expect(mockAggregateRaw.mock.calls[0]![0]).toMatchObject({ collectionName: 'people', rowsPerPage: 5, page: 1 })
    expect(pipelineOf(0)).toEqual([{ stage: '$match', value: { price: { $gte: 10 } } }, { stage: '$limit', value: 5 }])
    const table = c.find('[data-test="preview-table"]')
    expect(table.text()).toContain('20')
    expect(table.text()).toContain('30')
    expect(c.find('[data-test="stage-preview"]').text()).toContain('First 5 documents after stage 1')
  })

  it('a later stage previews every stage before it as well', async () => {
    const c = await mountBuilder()
    await addStage(c, '$group', '{ "_id": "$grp", "n": { "$sum": 1 } }')
    await previewButton(c, 1).trigger('click')
    await wait()
    expect(pipelineOf(0)).toEqual([{ stage: '$group', value: { _id: '$grp', n: { $sum: 1 } } }, { stage: '$limit', value: 5 }]) // the empty first $match is left out
    expect(c.find('[data-test="stage-preview"]').text()).toContain('after stage 2')
  })

  it('runs again once, after a pause, when a stage it shows is edited', async () => {
    const c = await mountBuilder()
    await previewButton(c).trigger('click')
    await wait()
    mockAggregateRaw.mockClear()

    const area = stageTextareas(c)[0]!
    await area.setValue('{ "a": 1 }')
    await area.setValue('{ "a": 12 }')
    await area.setValue('{ "a": 123 }')
    await wait(100)
    expect(mockAggregateRaw).not.toHaveBeenCalled()
    expect(c.find('[data-test="preview-loading"]').exists()).toBe(true)

    await wait(PREVIEW_DEBOUNCE_MS + 150)
    expect(mockAggregateRaw).toHaveBeenCalledTimes(1)
    expect(pipelineOf(0)[0]).toEqual({ stage: '$match', value: { a: 123 } })
  })

  it('does not run while a stage up to here has an error', async () => {
    const c = await mountBuilder()
    await stageTextareas(c)[0]!.setValue('{ oops')
    await wait()
    await previewButton(c).trigger('click')
    await wait()
    expect(c.find('[data-test="preview-blocked"]').text()).toContain('Fix the stages up to here first')
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })

  it('shows the server\'s message when the preview fails, and says when nothing is left', async () => {
    mockAggregateRaw.mockRejectedValueOnce(Object.assign(new Error('x'), { response: new Response(JSON.stringify({ code: 40324, msg: 'Unrecognized pipeline stage name: \'$nope\'' }), { status: 500 }) }))
    const c = await mountBuilder()
    await previewButton(c).trigger('click')
    await wait(150)
    expect(c.find('[data-test="preview-error"]').text()).toContain('Unrecognized pipeline stage name')

    await previewButton(c).trigger('click') // hide
    mockAggregateRaw.mockResolvedValue(rawResponse([]))
    await previewButton(c).trigger('click') // show again
    await wait(150)
    expect(c.find('[data-test="preview-empty"]').text()).toContain('No documents after this stage')
  })

  it('stops asking once hidden, and never touches the real result', async () => {
    const c = await mountBuilder()
    await previewButton(c).trigger('click')
    await wait()
    await previewButton(c).trigger('click')
    expect(c.find('[data-test="stage-preview"]').exists()).toBe(false)
    mockAggregateRaw.mockClear()
    await stageTextareas(c)[0]!.setValue('{ "a": 1 }')
    await wait(PREVIEW_DEBOUNCE_MS + 150)
    expect(mockAggregateRaw).not.toHaveBeenCalled()
    expect(c.text()).not.toContain('The pipeline returned no results')
  })

  it('cancels a preview that is still running when it is hidden', async () => {
    let signal: AbortSignal | undefined
    mockAggregateRaw.mockImplementation((_request: unknown, init: { signal: AbortSignal }) => new Promise(() => {
      signal = init.signal
    }))
    const c = await mountBuilder()
    await previewButton(c).trigger('click')
    await wait()
    expect(signal).toBeDefined()
    expect(signal!.aborted).toBe(false)
    await previewButton(c).trigger('click')
    await wait()
    expect(signal!.aborted).toBe(true)
  })
})

describe('templates', () => {
  async function openTemplates(c: Mounted) {
    await button(c, 'Templates')!.trigger('click')
    await wait()
  }
  const field = (label: string) => body().find(`input[aria-label="${label}"]`)
  const add = async () => {
    await body().find('[data-test="templates-panel"] button[type="submit"]').trigger('click')
    await wait()
  }

  it('fills the empty editor with a count by field and the stages stay editable', async () => {
    const c = await mountBuilder()
    await openTemplates(c)
    await field('Field').setValue('grp')
    await add()
    expect(stageValues(c)).toEqual([{ _id: '$grp', count: { $sum: 1 } }, { count: -1 }])

    await stageTextareas(c)[1]!.setValue('{ "count": 1 }')
    await wait()
    await button(c, 'Run')!.trigger('click')
    await wait()
    expect(pipelineOf(0)).toEqual([{ stage: '$group', value: { _id: '$grp', count: { $sum: 1 } } }, { stage: '$sort', value: { count: 1 } }])
  })

  it('adds after the stages that are already there', async () => {
    const c = await mountBuilder()
    await stageTextareas(c)[0]!.setValue('{ "price": { "$gte": 10 } }')
    await wait()
    await openTemplates(c)
    await field('Field').setValue('grp')
    await add()
    expect(stageValues(c)).toHaveLength(3)
    expect(stageValues(c)[0]).toEqual({ price: { $gte: 10 } })
  })

  it('most common values keeps only the top N', async () => {
    const c = await mountBuilder()
    await openTemplates(c)
    c.findAllComponents(USelect).find(s => s.html().includes('aria-label="Template"'))!.vm.$emit('update:modelValue', 'top-values')
    await wait()
    await field('Field').setValue('grp')
    await field('How many values').setValue('3')
    await add()
    expect(stageValues(c).at(-1)).toBe(3)
  })

  it('date histogram and sum/avg ask for what they need', async () => {
    const c = await mountBuilder()
    await openTemplates(c)
    c.findAllComponents(USelect).find(s => s.html().includes('aria-label="Template"'))!.vm.$emit('update:modelValue', 'date-histogram')
    await wait()
    await field('Date field').setValue('when')
    await add()
    expect(stageValues(c)[0]).toEqual({ _id: { $dateToString: { format: '%Y-%m', date: '$when' } }, count: { $sum: 1 } })

    c.findAllComponents(USelect).find(s => s.html().includes('aria-label="Template"'))!.vm.$emit('update:modelValue', 'sum-avg-by-group')
    await wait()
    expect(field('Number field').exists()).toBe(true)
  })

  it('says what is wrong and adds nothing', async () => {
    const c = await mountBuilder()
    await openTemplates(c)
    await field('Field').setValue('$bad')
    await add()
    expect(body().text()).toContain('Enter a field name without $')
    expect(stageValues(c)).toEqual([{}]) // still just the untouched $match
  })

  it('offers the field names of the collection while typing', async () => {
    const c = await mountBuilder()
    expect(mockGetFields).toHaveBeenCalledWith({ collectionName: 'people' }, expect.anything())
    await openTemplates(c)
    expect(body().findAll('datalist#aggregation-fields option').map(o => o.attributes('value'))).toEqual(['grp', 'price', 'when'])
  })

  it('still works when the field names cannot be loaded', async () => {
    mockGetFields.mockRejectedValue(new Error('no'))
    const c = await mountBuilder()
    await openTemplates(c)
    await field('Field').setValue('grp')
    await add()
    expect(stageValues(c)).toHaveLength(2)
  })

  it('is not offered in the JSON view', async () => {
    const c = await mountBuilder()
    await button(c, 'JSON')!.trigger('click')
    await wait()
    expect(button(c, 'Templates')).toBeUndefined()
  })
})

describe('saved pipelines', () => {
  async function openSaved(c: Mounted) {
    await button(c, 'Saved pipelines')!.trigger('click')
    await wait()
  }
  const name = () => body().find('input[aria-label="Name"]')
  const save = async () => {
    await body().find('[data-test="saved-panel"] button[type="submit"]').trigger('click')
    await wait()
  }

  it('saves the current pipeline, restores it into the editor and deletes it', async () => {
    const c = await mountBuilder()
    await stageTextareas(c)[0]!.setValue('{ "price": { "$gte": 10 } }')
    await addStage(c, '$limit', '5')
    await openSaved(c)
    await name().setValue('Pricey')
    await save()
    expect(body().text()).toContain('Pricey')

    await stageTextareas(c)[0]!.setValue('{}')
    await wait()
    await button(body(), 'Pricey')!.trigger('click')
    await wait()
    expect(stageValues(c)).toEqual([{ price: { $gte: 10 } }, 5])

    await button(body(), 'Delete saved pipeline Pricey')!.trigger('click')
    expect(body().text()).not.toContain('Pricey')
  })

  it('keeps them per collection and in this browser only', async () => {
    const c = await mountBuilder()
    await addStage(c, '$count', '"n"')
    await openSaved(c)
    await name().setValue('Counter')
    await save()
    expect(localStorage.getItem('nuxt-ui-mongocamp:savedPipelines:people')).toContain('Counter')
    expect(localStorage.getItem('nuxt-ui-mongocamp:savedPipelines:orders')).toBeNull()
  })

  it('cannot save an empty pipeline or an invalid one', async () => {
    const c = await mountBuilder()
    await openSaved(c)
    await name().setValue('Nothing')
    await save()
    expect(body().text()).toContain('Fix the pipeline first')
    expect(localStorage.getItem('nuxt-ui-mongocamp:savedPipelines:people')).toBeNull()
  })

  it('opens a saved pipeline with a stage the editor has no form for in the JSON view', async () => {
    localStorage.setItem('nuxt-ui-mongocamp:savedPipelines:people', JSON.stringify({ v: 1, data: { pipelines: [{ name: 'Facet', pipeline: [{ stage: '$facet', value: { a: [{ $count: 'n' }] } }] }] } }))
    const c = await mountBuilder()
    await openSaved(c)
    await button(body(), 'Facet')!.trigger('click')
    await wait()
    expect((c.find('textarea[aria-label="Pipeline (JSON array)"]').element as HTMLTextAreaElement).value).toContain('$facet')
  })

  it('never brings back a denied operator from edited storage', async () => {
    localStorage.setItem('nuxt-ui-mongocamp:savedPipelines:people', JSON.stringify({ v: 1, data: { pipelines: [
      { name: 'Safe', pipeline: [{ stage: '$limit', value: 1 }] },
      { name: 'Evil', pipeline: [{ stage: '$out', value: 'stolen' }] },
      { name: 'Join', pipeline: [{ stage: '$lookup', value: { from: 'x', localField: 'a', foreignField: 'b', as: 'z' } }] },
    ] } }))
    const c = await mountBuilder()
    await openSaved(c)
    expect(body().text()).toContain('Safe')
    expect(body().text()).not.toContain('Evil')
    expect(body().text()).not.toContain('Join')
  })
})

describe('a filter from the table', () => {
  const previewButton = (c: Mounted) => c.findAll('button').find(b => b.text() === 'Preview after this stage')!
  async function mountWithFilter(filter = 'status:open') {
    const c = await mountSuspended(withUApp(MongocampAggregationBuilder), { route: '/', props: { collectionName: 'people', filter } })
    await wait()
    return c
  }

  it('shows what it applies to and sends the filter with the run', async () => {
    const c = await mountWithFilter()
    expect(c.find('[data-test="applied-filter"]').text()).toContain('status:open')

    await button(c, 'Run')!.trigger('click')
    await wait()

    expect(mockAggregateRaw.mock.calls[0]![0].filter).toBe('status:open')
  })

  it('sends it with the stage previews too', async () => {
    const c = await mountWithFilter()
    mockAggregateRaw.mockResolvedValue(rawResponse([{ _id: 'a' }]))
    await previewButton(c).trigger('click')
    await wait()

    expect(mockAggregateRaw.mock.calls[0]![0].filter).toBe('status:open')
  })

  it('the chip\'s remove button drops it for the next runs', async () => {
    const c = await mountWithFilter()
    await c.find('[data-test="applied-filter"] button').trigger('click')
    await wait()
    expect(c.find('[data-test="applied-filter"]').exists()).toBe(false)

    await button(c, 'Run')!.trigger('click')
    await wait()
    expect(mockAggregateRaw.mock.calls[0]![0].filter).toBeUndefined()
  })

  it('is absent without a filter', async () => {
    const c = await mountBuilder()
    expect(c.find('[data-test="applied-filter"]').exists()).toBe(false)
    await button(c, 'Run')!.trigger('click')
    await wait()
    expect(mockAggregateRaw.mock.calls[0]![0].filter).toBeUndefined()
  })
})
