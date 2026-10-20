import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, UPagination, USelect } from '#components'
import MongocampAggregationBuilder from '../../src/runtime/components/MongocampAggregationBuilder.vue'

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

const mockAggregateRaw = vi.fn()

mockNuxtImport('useMongocampApi', () => {
  return () => ({ collectionApi: { aggregateRaw: mockAggregateRaw } })
})

function rawResponse(rows: unknown, headers: Record<string, string> = {}) {
  return {
    raw: { headers: { get: (name: string) => headers[name] ?? null } },
    value: () => Promise.resolve(rows),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAggregateRaw.mockResolvedValue(rawResponse([]))
})

async function mountBuilder() {
  return mountSuspended(withUApp(MongocampAggregationBuilder), { route: '/', props: { collectionName: 'people' } })
}

type Mounted = Awaited<ReturnType<typeof mountBuilder>>

const button = (component: Mounted, text: string) => component.findAll('button').find(b => b.text() === text)
const runButton = (component: Mounted) => button(component, 'Run')!
const stageTextareas = (component: Mounted) => component.findAll('textarea[aria-label^="JSON of the"]')
const selectByLabel = (component: Mounted, label: string) => component.findAllComponents(USelect).find(s => s.html().includes(`aria-label="${label}"`))!

async function setStageText(component: Mounted, index: number, text: string) {
  await stageTextareas(component)[index]!.setValue(text)
  await wait()
}

async function addStage(component: Mounted, type: '$group' | '$sort' | '$project' | '$limit' | '$match', text?: string) {
  selectByLabel(component, 'Stage type').vm.$emit('update:modelValue', type)
  await wait()
  await button(component, 'Add stage')?.trigger('click')
  await wait()
  if (text !== undefined) await setStageText(component, stageTextareas(component).length - 1, text)
}

function sentPipeline(call = 0) {
  return mockAggregateRaw.mock.calls[call]![0].mongoAggregateRequest.pipeline
}

describe('MongocampAggregationBuilder — stage editor', () => {
  it('starts with one empty $match stage, which is left out of the request', async () => {
    const component = await mountBuilder()

    expect(stageTextareas(component)).toHaveLength(1)
    expect(component.text()).toContain('$match')

    await runButton(component).trigger('click')
    await wait()

    expect(mockAggregateRaw).toHaveBeenCalledTimes(1)
    expect(mockAggregateRaw.mock.calls[0]![0]).toMatchObject({ collectionName: 'people', rowsPerPage: 20, page: 1 })
    expect(sentPipeline()).toEqual([])
  })

  it('runs the stages in order as raw JSON values, with a typed limit sent as a number', async () => {
    const component = await mountBuilder()
    await setStageText(component, 0, '{"grp":"A"}')
    await addStage(component, '$group', '{ "_id": "$grp", "n": { "$sum": 1 } }')
    await addStage(component, '$sort', '{ "n": -1 }')
    await addStage(component, '$limit', '5')

    await runButton(component).trigger('click')
    await wait()

    expect(sentPipeline()).toEqual([
      { stage: '$match', value: { grp: 'A' } },
      { stage: '$group', value: { _id: '$grp', n: { $sum: 1 } } },
      { stage: '$sort', value: { n: -1 } },
      { stage: '$limit', value: 5 },
    ])
  })

  it('moves and removes stages', async () => {
    const component = await mountBuilder()
    await setStageText(component, 0, '{"a":1}')
    await addStage(component, '$sort', '{"b":1}')

    await component.findAll('button[aria-label="Move stage up"]')[1]!.trigger('click')
    await wait()
    expect(stageTextareas(component).map(t => (t.element as HTMLTextAreaElement).value)).toEqual(['{"b":1}', '{"a":1}'])

    await component.findAll('button[aria-label="Remove stage"]')[0]!.trigger('click')
    await wait()
    expect(stageTextareas(component).map(t => (t.element as HTMLTextAreaElement).value)).toEqual(['{"a":1}'])
  })

  it.each([
    ['{bad', 'Not valid JSON'],
    ['[1]', 'This stage needs a JSON object'],
  ])('blocks running while a $match stage holds %s, and says why', async (text, message) => {
    const component = await mountBuilder()
    await setStageText(component, 0, text)

    expect(component.text()).toContain(message)
    expect(runButton(component).attributes('disabled')).toBeDefined()
    await runButton(component).trigger('click')
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })

  it('catches a limit that is not a positive whole number, a $group without _id and a bad sort', async () => {
    const component = await mountBuilder()
    await addStage(component, '$limit', '0')
    expect(component.text()).toContain('The limit must be a whole number of 1 or more')

    await setStageText(component, 1, '3')
    await addStage(component, '$group', '{ "n": { "$sum": 1 } }')
    expect(component.text()).toContain('$group needs an _id')

    await setStageText(component, 2, '{ "_id": null }')
    await addStage(component, '$sort', '{ "n": 2 }')
    expect(component.text()).toContain('Sort directions must be 1 or -1')
    expect(runButton(component).attributes('disabled')).toBeDefined()
  })

  it('refuses a forbidden operator hidden inside a stage and names it', async () => {
    const component = await mountBuilder()
    await addStage(component, '$project', '{ "x": { "$function": { "body": "function(){}", "args": [], "lang": "js" } } }')

    expect(component.text()).toContain('$function is not allowed')
    expect(runButton(component).attributes('disabled')).toBeDefined()
    await runButton(component).trigger('click')
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })
})

describe('MongocampAggregationBuilder — JSON view', () => {
  async function toJson(component: Mounted) {
    await button(component, 'JSON')?.trigger('click')
    await wait()
    return component.find('textarea[aria-label="Pipeline (JSON array)"]')
  }

  it('shows the pipeline built from the stages and runs what is typed there', async () => {
    const component = await mountBuilder()
    await setStageText(component, 0, '{"grp":"A"}')

    const text = await toJson(component)
    expect(JSON.parse((text.element as HTMLTextAreaElement).value)).toEqual([{ $match: { grp: 'A' } }])

    await text.setValue('[{"$unwind":"$tags"},{"$limit":3}]')
    await wait()
    await runButton(component).trigger('click')
    await wait()

    expect(sentPipeline()).toEqual([{ stage: '$unwind', value: '$tags' }, { stage: '$limit', value: 3 }])
  })

  it('refuses a forbidden operator typed in, with the stage number, and does not send it', async () => {
    const component = await mountBuilder()
    const text = await toJson(component)

    await text.setValue('[{"$limit":1},{"$addFields":{"x":{"$function":{"body":"x","args":[],"lang":"js"}}}}]')
    await wait()

    expect(component.text()).toContain('$function is not allowed (stage 2)')
    expect(runButton(component).attributes('disabled')).toBeDefined()
    await runButton(component).trigger('click')
    expect(mockAggregateRaw).not.toHaveBeenCalled()
  })

  it.each([
    ['[{', 'The pipeline is not valid JSON'],
    ['{"$match":{}}', 'The pipeline must be a JSON array of stages'],
    ['[{"match":{}}]', 'Stage 1 must be an object with exactly one key that starts with $'],
    ['[{"$out":"x"}]', '$out is not allowed (stage 1)'],
  ])('explains an invalid pipeline (%s)', async (typed, message) => {
    const component = await mountBuilder()
    const text = await toJson(component)

    await text.setValue(typed)
    await wait()

    expect(component.text()).toContain(message)
    expect(runButton(component).attributes('disabled')).toBeDefined()
  })

  it('switches back to stages when the pipeline fits them, and stays in JSON when it does not', async () => {
    const component = await mountBuilder()
    const text = await toJson(component)

    await text.setValue('[{"$unwind":"$tags"}]')
    await wait()
    await button(component, 'Stages')?.trigger('click')
    await wait()
    expect(component.text()).toContain('no form for')
    expect(component.find('textarea[aria-label="Pipeline (JSON array)"]').exists()).toBe(true)

    await text.setValue('[{"$match":{"a":1}},{"$limit":2}]')
    await wait()
    await button(component, 'Stages')?.trigger('click')
    await wait()
    expect(component.find('textarea[aria-label="Pipeline (JSON array)"]').exists()).toBe(false)
    expect(stageTextareas(component).map(t => JSON.parse((t.element as HTMLTextAreaElement).value))).toEqual([{ a: 1 }, 2])
  })

  it('will not leave the stage editor while a stage has a mistake in it', async () => {
    const component = await mountBuilder()
    await setStageText(component, 0, '{bad')

    await button(component, 'JSON')?.trigger('click')
    await wait()

    expect(component.text()).toContain('Fix the stages with errors before switching to JSON')
    expect(component.find('textarea[aria-label="Pipeline (JSON array)"]').exists()).toBe(false)
  })
})

describe('MongocampAggregationBuilder — results', () => {
  const rows = [{ _id: 'A', total: 15050, tags: ['x', 'y'], when: '2024-01-15T12:00:00Z' }, { _id: 'B', total: 14950, nothing: null }]

  async function runWith(component: Mounted, response: unknown = rawResponse(rows, { 'x-pagination-count-rows': '2', 'x-pagination-count-pages': '1', 'x-pagination-current-page': '1' })) {
    mockAggregateRaw.mockResolvedValue(response)
    await runButton(component).trigger('click')
    await wait()
  }

  it('shows the rows in a table with _id first, the total, and the plain-JSON note', async () => {
    const component = await mountBuilder()
    await runWith(component)

    expect(component.findAll('th').map(th => th.text())).toEqual(['_id', 'total', 'tags', 'when', 'nothing'])
    expect(component.text()).toContain('15050')
    expect(component.text()).toContain('["x","y"]')
    expect(component.text()).toContain('null')
    expect(component.text()).toContain('2 results')
    expect(component.text()).toContain('whole numbers beyond 2^53 may be rounded')
  })

  it('shows an empty state when the pipeline returns nothing, and disables the export', async () => {
    const component = await mountBuilder()
    await runWith(component, rawResponse([], { 'x-pagination-count-rows': '0' }))

    expect(component.text()).toContain('The pipeline returned no results')
    expect(component.find('button[aria-label="Export this page"]').attributes('disabled')).toBeDefined()
  })

  it('enables the export once there are rows', async () => {
    const component = await mountBuilder()
    await runWith(component)

    expect(component.find('button[aria-label="Export this page"]').attributes('disabled')).toBeUndefined()
  })

  it('pages through the result with the pipeline that produced it, not with what has been typed since', async () => {
    const component = await mountBuilder()
    await setStageText(component, 0, '{"grp":"A"}')
    await runWith(component, rawResponse(rows, { 'x-pagination-count-rows': '100', 'x-pagination-count-pages': '5', 'x-pagination-current-page': '1' }))
    await setStageText(component, 0, '{"grp":"B"}')

    mockAggregateRaw.mockResolvedValue(rawResponse(rows, { 'x-pagination-count-rows': '100', 'x-pagination-count-pages': '5', 'x-pagination-current-page': '2' }))
    component.findComponent(UPagination).vm.$emit('update:page', 2)
    await wait()

    expect(mockAggregateRaw).toHaveBeenCalledTimes(2)
    expect(mockAggregateRaw.mock.calls[1]![0]).toMatchObject({ page: 2, rowsPerPage: 20 })
    expect(sentPipeline(1)).toEqual([{ stage: '$match', value: { grp: 'A' } }])
  })

  it('goes back to page 1 when the page size changes', async () => {
    const component = await mountBuilder()
    await runWith(component, rawResponse(rows, { 'x-pagination-count-rows': '100', 'x-pagination-count-pages': '5', 'x-pagination-current-page': '1' }))

    selectByLabel(component, 'Rows per page').vm.$emit('update:modelValue', 50)
    await wait()

    expect(mockAggregateRaw.mock.calls[1]![0]).toMatchObject({ page: 1, rowsPerPage: 50 })
  })

  it('shows only the MongoDB message when the server rejects the pipeline — never the database server address', async () => {
    const body = { code: -1, msg: 'Command failed with error 15959 (Location15959): \'the match filter must be an expression in an object\' on server 173.249.2.248:5455. The full response is {"ok": 0.0}' }
    mockAggregateRaw.mockRejectedValue(Object.assign(new Error('Response returned an error code'), {
      name: 'ResponseError',
      response: new Response(JSON.stringify(body), { status: 500 }),
    }))
    const component = await mountBuilder()
    await runButton(component).trigger('click')
    await wait()

    expect(component.text()).toContain('The pipeline could not be run')
    expect(component.text()).toContain('the match filter must be an expression in an object')
    expect(component.text()).not.toMatch(/173\.249|5455/)
    expect(component.text()).not.toContain('Command failed')
  })

  it('clears the result when the collection changes, because a result belongs to one collection', async () => {
    const collection = ref('people')
    const Host = defineComponent({
      setup: () => () => h(UApp, () => h(MongocampAggregationBuilder, { collectionName: collection.value })),
    })
    const component = await mountSuspended(Host, { route: '/' })
    await runWith(component as unknown as Mounted)
    expect(component.text()).toContain('2 results')

    collection.value = 'orders'
    await nextTick()
    await wait()

    expect(component.text()).not.toContain('2 results')
    expect(component.text()).not.toContain('15050')
  })
})
