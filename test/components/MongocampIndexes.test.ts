import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { UApp, USelect } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampIndexes from '../../src/runtime/components/MongocampIndexes.vue'

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
const modal = () => new DOMWrapper(document.body)

const mockListIndices = vi.fn()
const mockCreateIndex = vi.fn()
const mockCreateText = vi.fn()
const mockCreateExpiring = vi.fn()
const mockDeleteIndex = vi.fn()
const mockInfo = vi.fn()
const mockAggregateRaw = vi.fn()

mockNuxtImport('useMongocampApi', () => () => ({
  indexApi: {
    listIndices: mockListIndices,
    createIndex: mockCreateIndex,
    createTextIndex: mockCreateText,
    createExpiringIndex: mockCreateExpiring,
    deleteIndex: mockDeleteIndex,
  },
  collectionApi: { getCollectionInformation: mockInfo, aggregateRaw: mockAggregateRaw },
}))

const rawResponse = (rows: unknown) => ({ raw: { headers: { get: () => null } }, value: () => Promise.resolve(rows) })
const since = '2026-11-01T10:00:00.000Z'

// recorded from server 1.6.3 (live spike 2026-11-04): the listing is unordered, text keys are internal
const INDEXES = [
  { name: '_id_', keys: { _id: 1 }, unique: true, text: false, expire: false, expireAfterSeconds: -1, weights: {} },
  { name: 'c_1_b_1', keys: { b: 1, c: 1 }, unique: true, text: false, expire: false, expireAfterSeconds: -1, weights: {} },
  { name: 'name_1', keys: { name: 1 }, unique: false, text: false, expire: false, expireAfterSeconds: -1, weights: {} },
  { name: 'when_1', keys: { when: 1 }, unique: false, text: false, expire: true, expireAfterSeconds: 3600, weights: {} },
  { name: 'body_text', keys: { _ftsx: 1, _fts: 'text' }, unique: false, text: true, expire: false, expireAfterSeconds: -1, weights: { body: 1 } },
]
const USAGE = [
  { name: '_id_', key: { _id: 1 }, accesses: { ops: 0, since } },
  { name: 'c_1_b_1', key: { c: 1, b: 1 }, accesses: { ops: 12, since } },
  { name: 'name_1', key: { name: 1 }, accesses: { ops: 0, since } },
  { name: 'when_1', key: { when: 1 }, accesses: { ops: 3, since } },
  { name: 'body_text', key: { _fts: 'text' }, accesses: { ops: 0, since } },
]

beforeEach(() => {
  vi.resetAllMocks() // also drops unused `…Once` results, so one failing test cannot leak into the next
  mockListIndices.mockResolvedValue(INDEXES)
  mockInfo.mockResolvedValue({ count: 10, size: 1, storageSize: 1, avgObjSize: 1, nindexes: 5, totalIndexSize: 1, indexSizes: { _id_: 4096, c_1_b_1: 20480, name_1: 20480, when_1: 20480, body_text: 20480 } })
  mockAggregateRaw.mockResolvedValue(rawResponse(USAGE))
  mockCreateIndex.mockResolvedValue({ name: 'a_1' })
  mockCreateText.mockResolvedValue({ name: 'body_text' })
  mockCreateExpiring.mockResolvedValue({ name: 'when_1' })
  mockDeleteIndex.mockResolvedValue({ dropped: true })
})

async function mountIndexes(props: Record<string, unknown> = {}) {
  const component = await mountSuspended(withUApp(MongocampIndexes), { route: '/', props: { collectionName: 'people', ...props } })
  await wait()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountIndexes>>
const row = (c: Mounted, name: string) => c.findAll('tbody tr').find(r => r.findAll('td')[0]?.text() === name)!
const cell = (c: Mounted, name: string, index: number) => row(c, name).findAll('td')[index]!.text()
const button = (scope: { findAll: (s: string) => Array<{ text: () => string, attributes: (n: string) => string | undefined, trigger: (e: string) => Promise<void> }> }, label: string) =>
  scope.findAll('button').find(b => b.text() === label || b.attributes('aria-label') === label)

describe('MongocampIndexes — list', () => {
  it('shows keys in index order, type flags, size and usage', async () => {
    const c = await mountIndexes()
    expect(cell(c, 'c_1_b_1', 1)).toBe('c: ↑, b: ↑') // the server listed { b, c }; the name keeps the order
    expect(cell(c, 'c_1_b_1', 2)).toContain('unique')
    expect(cell(c, 'when_1', 2)).toContain('expire 3600s')
    expect(cell(c, 'body_text', 1)).toBe('body (text)')
    expect(cell(c, 'body_text', 2)).toContain('text')
    expect(cell(c, 'name_1', 2)).toContain('standard')
    expect(cell(c, 'c_1_b_1', 3)).toBe('20 KB')
    expect(cell(c, '_id_', 3)).toBe('4.0 KB')
    expect(cell(c, 'c_1_b_1', 4)).toContain('12 uses')
    expect(cell(c, 'c_1_b_1', 4)).toContain(new Date(since).toLocaleDateString())
    expect(c.text()).toContain('5 indexes')
  })

  it('charts size and uses of the loaded indexes in a collapsed section, with the same numbers in the tables', async () => {
    const c = await mountIndexes()
    const charts = c.find('[data-testid="index-charts"]')
    expect(charts.exists()).toBe(true)
    expect(charts.attributes('open')).toBeUndefined()
    const tables = charts.findAll('[data-test="chart-table"]')
    expect(tables).toHaveLength(2)
    expect(tables[0]!.text()).toContain('20 KB')
    expect(tables[1]!.text()).toContain('12')
    expect(mockInfo).toHaveBeenCalledTimes(1) // nothing new was requested for the charts
  })

  it('flags an index nothing has used, never the _id index', async () => {
    const c = await mountIndexes()
    expect(cell(c, 'name_1', 4)).toContain('never used since')
    expect(cell(c, 'body_text', 4)).toContain('never used since')
    expect(cell(c, '_id_', 4)).not.toContain('never used')
    expect(cell(c, 'when_1', 4)).not.toContain('never used')
  })

  it('still lists the indexes when the usage numbers cannot be read', async () => {
    mockAggregateRaw.mockRejectedValue(new Error('no'))
    const c = await mountIndexes()
    expect(cell(c, 'name_1', 0)).toBe('name_1')
    expect(cell(c, 'name_1', 4)).toBe('—')
    expect(c.text()).toContain('Usage numbers are not available')
  })

  it('shows a dash instead of a size when the collection information fails', async () => {
    mockInfo.mockRejectedValue(new Error('no'))
    const c = await mountIndexes()
    expect(cell(c, 'name_1', 3)).toBe('—')
    expect(cell(c, 'name_1', 4)).toContain('never used')
  })

  it('shows an error alert when the indexes cannot be listed, and retry loads them', async () => {
    mockListIndices.mockRejectedValueOnce(Object.assign(new Error('The request failed'), { name: 'FetchError' }))
    const c = await mountIndexes()
    expect(c.text()).toContain('Failed to load data')
    await button(c, 'Retry')!.trigger('click')
    await wait()
    expect(c.text()).not.toContain('Failed to load data')
    expect(cell(c, 'name_1', 0)).toBe('name_1')
  })

  it('asks the stats stage through the gated path and never shows the server address', async () => {
    mockAggregateRaw.mockResolvedValue(rawResponse(USAGE.map(u => ({ ...u, host: 'mongo:27017', ns: 'db.people' }))))
    const c = await mountIndexes()
    expect(mockAggregateRaw.mock.calls[0]![0].mongoAggregateRequest.pipeline).toEqual([{ stage: '$indexStats', value: {} }])
    expect(c.html()).not.toContain('27017')
  })

  it('hides create and drop for a read-only view', async () => {
    const c = await mountIndexes({ canManage: false })
    expect(button(c, 'Create Index')).toBeUndefined()
    expect(c.findAll('[aria-label="Delete index"]')).toHaveLength(0)
  })
})

describe('MongocampIndexes — create', () => {
  async function openCreate(c: Mounted) {
    await button(c, 'Create Index')!.trigger('click')
    await wait()
  }
  const field = (position: number) => modal().find(`input[aria-label="Field ${position}"]`)
  const submit = async () => {
    await modal().find('button[type="submit"]').trigger('click')
    await wait()
  }

  it('creates a compound index with directions in field order, reloads and says what changed', async () => {
    const c = await mountIndexes()
    await openCreate(c)
    await field(1).setValue('country')
    await button(modal(), 'Add field')!.trigger('click')
    await field(2).setValue('age')
    await button(modal(), 'Direction of field 2')!.trigger('click')
    await submit()

    expect(mockCreateIndex).toHaveBeenCalledWith({ collectionName: 'people', indexCreateRequest: { keys: { country: 1, age: -1 }, indexOptionsRequest: undefined } })
    expect(mockListIndices).toHaveBeenCalledTimes(2)
    expect(c.findComponent(MongocampIndexes).emitted('changed')).toHaveLength(1)
    expect(modal().find('button[type="submit"]').exists()).toBe(false)
  })

  it('creates a unique index with a name through the options', async () => {
    const c = await mountIndexes()
    await openCreate(c)
    c.findComponent(USelect).vm.$emit('update:modelValue', 'unique')
    await wait()
    await field(1).setValue('email')
    await modal().find('input[aria-label="Name (optional)"]').setValue('email_unique')
    await submit()
    expect(mockCreateIndex.mock.calls[0]![0].indexCreateRequest).toEqual({ keys: { email: 1 }, indexOptionsRequest: { unique: true, name: 'email_unique' } })
  })

  it('creates a text index on one field and an expiring one with its duration', async () => {
    const c = await mountIndexes()
    await openCreate(c)
    c.findComponent(USelect).vm.$emit('update:modelValue', 'text')
    await wait()
    expect(button(modal(), 'Add field')).toBeUndefined()
    await field(1).setValue('body')
    await submit()
    expect(mockCreateText).toHaveBeenCalledWith({ collectionName: 'people', fieldName: 'body' })

    await openCreate(c)
    c.findComponent(USelect).vm.$emit('update:modelValue', 'expiring')
    await wait()
    await field(1).setValue('when')
    await modal().find('input[aria-label="Expire after"]').setValue('7d')
    await submit()
    expect(mockCreateExpiring).toHaveBeenCalledWith({ collectionName: 'people', fieldName: 'when', duration: '7d' })
  })

  it('asks for what is missing and sends nothing', async () => {
    const c = await mountIndexes()
    await openCreate(c)
    await submit()
    expect(modal().text()).toContain('A field name is empty')
    expect(mockCreateIndex).not.toHaveBeenCalled()

    c.findComponent(USelect).vm.$emit('update:modelValue', 'expiring')
    await wait()
    await field(1).setValue('when')
    await modal().find('input[aria-label="Expire after"]').setValue('soon')
    await submit()
    expect(modal().text()).toContain('Use a number and s, m, h or d')
    expect(mockCreateExpiring).not.toHaveBeenCalled()
  })

  it('refuses the same field twice', async () => {
    const c = await mountIndexes()
    await openCreate(c)
    await field(1).setValue('a')
    await button(modal(), 'Add field')!.trigger('click')
    await field(2).setValue('a')
    await submit()
    expect(modal().text()).toContain('A field is listed twice')
    expect(mockCreateIndex).not.toHaveBeenCalled()
  })

  it('explains a unique index over repeated values and keeps the dialog open', async () => {
    mockCreateIndex.mockRejectedValueOnce(new Error('Write failed with error code 11000 and error message \'Index build failed … E11000 duplicate key error\''))
    const c = await mountIndexes()
    await openCreate(c)
    c.findComponent(USelect).vm.$emit('update:modelValue', 'unique')
    await wait()
    await field(1).setValue('name')
    await submit()
    expect(modal().text()).toContain('repeat values of these fields')
    expect(modal().find('button[type="submit"]').exists()).toBe(true)
    expect(c.findComponent(MongocampIndexes).emitted('changed')).toBeUndefined()
  })

  it('shows the message of any other failure', async () => {
    mockCreateIndex.mockRejectedValueOnce(new Error('something odd'))
    const c = await mountIndexes()
    await openCreate(c)
    await field(1).setValue('a')
    await submit()
    expect(modal().text()).toContain('something odd')
  })

  it('offers the given field names while typing', async () => {
    const c = await mountIndexes({ fields: ['name', 'age'] })
    await openCreate(c)
    const list = modal().find('datalist')
    expect(list.findAll('option').map(o => o.attributes('value'))).toEqual(['name', 'age'])
    expect(field(1).attributes('list')).toBe(list.attributes('id'))
  })
})

describe('MongocampIndexes — drop', () => {
  async function openDrop(c: Mounted, name: string) {
    await row(c, name).find('button[aria-label="Delete index"]').trigger('click')
    await wait()
  }
  const confirm = () => modal().findAll('button').find(b => b.text() === 'Delete index')!

  it('never offers to drop the _id index', async () => {
    const c = await mountIndexes()
    expect(row(c, '_id_').find('button[aria-label="Delete index"]').exists()).toBe(false)
    expect(row(c, 'name_1').find('button[aria-label="Delete index"]').exists()).toBe(true)
  })

  it('drops only after the index name is typed, then reloads and says what changed', async () => {
    const c = await mountIndexes()
    await openDrop(c, 'name_1')
    expect(confirm().attributes('disabled')).toBeDefined()
    await confirm().trigger('click')
    expect(mockDeleteIndex).not.toHaveBeenCalled()

    await modal().find('input').setValue('name_1')
    await wait()
    await confirm().trigger('click')
    await wait()

    expect(mockDeleteIndex).toHaveBeenCalledWith({ collectionName: 'people', indexName: 'name_1' })
    expect(mockListIndices).toHaveBeenCalledTimes(2)
    expect(c.findComponent(MongocampIndexes).emitted('changed')).toHaveLength(1)
  })

  it('keeps the dialog open with the server message when the drop fails', async () => {
    mockDeleteIndex.mockRejectedValueOnce(new Error('index not found with name [name_1]'))
    const c = await mountIndexes()
    await openDrop(c, 'name_1')
    await modal().find('input').setValue('name_1')
    await wait()
    await confirm().trigger('click')
    await wait()
    expect(modal().text()).toContain('index not found')
    expect(c.findComponent(MongocampIndexes).emitted('changed')).toBeUndefined()
  })
})

describe('MongocampIndexes — reload', () => {
  it('follows a changed collection name', async () => {
    const name = shallowRef('people')
    const Host = defineComponent({ setup: () => () => h(UApp, () => h(MongocampIndexes, { collectionName: name.value })) })
    await mountSuspended(Host, { route: '/' })
    await wait()
    mockListIndices.mockClear()
    name.value = 'orders'
    await wait()
    expect(mockListIndices).toHaveBeenCalledWith({ collectionName: 'orders' })
  })
})
