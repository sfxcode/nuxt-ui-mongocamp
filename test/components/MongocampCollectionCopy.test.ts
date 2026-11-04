import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampCollectionCopy from '../../src/runtime/components/MongocampCollectionCopy.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const modal = () => new DOMWrapper(document.body)

const mockListCollections = vi.fn()
const mockGetInfo = vi.fn()
const mockListDocumentsRaw = vi.fn()
const mockInsertMany = vi.fn()
const mockListIndices = vi.fn()
const mockCreateIndex = vi.fn()
const mockCreateTextIndex = vi.fn()

mockNuxtImport('useMongocampApi', () => () => ({
  collectionApi: { listCollections: mockListCollections, getCollectionInformation: mockGetInfo },
  documentApi: { listDocumentsRaw: mockListDocumentsRaw, insertMany: mockInsertMany },
  indexApi: { listIndices: mockListIndices, createIndex: mockCreateIndex, createTextIndex: mockCreateTextIndex },
}))
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'alice@example.com' } } }))

const hex = (n: number) => n.toString(16).padStart(24, '0')
const docs = (count: number) => Array.from({ length: count }, (_, i) => ({ _id: hex(i + 1), n: i }))

function serveSource(total: number) {
  const rows = docs(total)
  mockListDocumentsRaw.mockImplementation(async (request: { rowsPerPage?: number, page?: number }) => {
    const size = request.rowsPerPage ?? 100
    const page = request.page ?? 1
    return { raw: { headers: { get: (name: string) => (name === 'x-pagination-count-rows' ? String(total) : null) } }, value: () => Promise.resolve(rows.slice((page - 1) * size, page * size)) }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListCollections.mockResolvedValue(['orders', 'users'])
  mockInsertMany.mockResolvedValue({})
  mockGetInfo.mockResolvedValue({ count: 0 })
  mockListIndices.mockResolvedValue([])
  mockCreateIndex.mockResolvedValue({ name: 'x' })
  mockCreateTextIndex.mockResolvedValue({ name: 'x' })
  serveSource(3)
})

// the dialog is opened by its parent through v-model:open, like in MongocampCollections
async function mountCopy(props: Record<string, unknown> = {}) {
  const done: unknown[] = []
  const open = shallowRef(true)
  const Host = defineComponent({
    setup: () => () => h(UApp, () => h(MongocampCollectionCopy, {
      'source': 'orders',
      'open': open.value,
      'onUpdate:open': (v: boolean) => (open.value = v),
      'onDone': (v: unknown) => done.push(v),
      ...props,
    })),
  })
  const component = await mountSuspended(Host, { route: '/' })
  await wait()
  return { component, done, open }
}

const nameInput = () => modal().find('input[aria-label="Name of the new collection"]')
const button = (label: string) => modal().findAll('button').find(b => b.text() === label)!
const type = async (value: string) => {
  await nameInput().setValue(value)
  await wait()
}

describe('MongocampCollectionCopy — form', () => {
  it('shows how many documents will be copied and keeps Copy disabled until the name is valid', async () => {
    await mountCopy()
    expect(modal().find('[data-test="copy-count"]').text()).toBe('3 documents will be copied.')
    expect(button('Copy').attributes('disabled')).toBeDefined()
    await type('orders_copy')
    expect(button('Copy').attributes('disabled')).toBeUndefined()
  })

  it('says why a name is refused', async () => {
    await mountCopy()
    for (const [name, message] of [['users', 'already exists'], ['orders', 'other than the source'], ['mc_users', 'reserved'], ['a b', 'letters, digits'], ['photos.files', 'reserved']] as const) {
      await type(name)
      expect(modal().text()).toContain(message)
      expect(button('Copy').attributes('disabled')).toBeDefined()
    }
  })

  it('titles a filtered copy and counts the matching documents', async () => {
    await mountCopy({ filter: 'status:open' })
    expect(modal().text()).toContain('Copy matching documents of orders')
    expect(modal().find('[data-test="copy-count"]').text()).toBe('3 matching documents will be copied.')
    expect(mockListDocumentsRaw.mock.calls[0]![0].filter).toBe('status:open')
  })

  it('refuses a collection above the cap', async () => {
    serveSource(50_001)
    await mountCopy()
    await type('big_copy')
    expect(modal().text()).toContain('holds 50001 documents; at most 50000')
    expect(button('Copy').attributes('disabled')).toBeDefined()
  })

  it('says so when the documents cannot be counted', async () => {
    mockListDocumentsRaw.mockRejectedValue(new Error('x'))
    await mountCopy()
    expect(modal().text()).toContain('could not be counted')
    await type('x')
    expect(button('Copy').attributes('disabled')).toBeDefined()
  })

  it('reads the names and the count again each time it is opened', async () => {
    const { open } = await mountCopy()
    expect(mockListCollections).toHaveBeenCalledTimes(1)
    open.value = false
    await wait()
    open.value = true
    await wait()
    expect(mockListCollections).toHaveBeenCalledTimes(2)
  })
})

const idx = (patch: Record<string, unknown>) => ({ name: 'x', keys: {}, unique: false, text: false, expire: false, expireAfterSeconds: -1, weights: {}, ...patch })
const SOURCE_INDEXES = [
  idx({ name: '_id_', keys: { _id: 1 }, unique: true }),
  idx({ name: 'a_1', keys: { a: 1 } }),
  idx({ name: 'c_1_b_-1', keys: { b: -1, c: 1 }, unique: true }),
  idx({ name: 'custom_ba', keys: { a: 1, b: 1 } }),
  idx({ name: 'two_text', text: true, keys: { _fts: 'text' }, weights: { a: 1, b: 1 } }),
]

describe('MongocampCollectionCopy — indexes', () => {
  const checkbox = () => modal().find('button[role="checkbox"]')

  it('offers to create the same indexes, on by default', async () => {
    await mountCopy()
    expect(modal().text()).toContain('Also create the same indexes')
    expect(checkbox().attributes('aria-checked')).toBe('true')
  })

  it('a quick backup creates the source indexes on the new collection and says what it could not copy', async () => {
    mockListIndices.mockResolvedValue(SOURCE_INDEXES)
    mockGetInfo.mockResolvedValue({ count: 3 })
    await mountCopy()
    await button('Quick backup').trigger('click')
    await wait(200)

    const target = mockInsertMany.mock.calls[0]![0].collectionName as string
    expect(mockCreateIndex.mock.calls.map(c => [c[0].collectionName, c[0].indexCreateRequest.keys])).toEqual([[target, { a: 1 }], [target, { c: 1, b: -1 }]])
    const text = modal().find('[data-test="copy-indexes"]').text()
    expect(text).toContain('Indexes created: 2')
    expect(text).toContain('Not copied: custom_ba — the field order of this index is not known')
    expect(text).toContain('Not copied: two_text — a text index over several fields cannot be created here')
  })

  it('a normal copy does the same, and unticking creates no index at all', async () => {
    mockListIndices.mockResolvedValue(SOURCE_INDEXES)
    await mountCopy()
    await checkbox().trigger('click')
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait(200)
    expect(mockListIndices).not.toHaveBeenCalled()
    expect(mockCreateIndex).not.toHaveBeenCalled()
    expect(modal().find('[data-test="copy-indexes"]').exists()).toBe(false)
  })

  it('lists an index the server refused', async () => {
    mockListIndices.mockResolvedValue(SOURCE_INDEXES)
    mockCreateIndex.mockRejectedValueOnce(new Error('index refused')).mockResolvedValue({})
    await mountCopy()
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait(200)
    expect(modal().find('[data-test="copy-indexes"]').text()).toContain('Could not create a_1: index refused')
  })

  it('says when the source has only the default index', async () => {
    mockListIndices.mockResolvedValue([SOURCE_INDEXES[0]])
    await mountCopy()
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait(200)
    expect(modal().find('[data-test="copy-indexes"]').text()).toContain('no indexes besides the default one')
  })

  it('says when the indexes of the source could not be read, but the documents are copied', async () => {
    mockListIndices.mockRejectedValue(new Error('no'))
    mockGetInfo.mockResolvedValue({ count: 3 })
    await mountCopy()
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait(200)
    expect(modal().text()).toContain('Copied 3 documents to orders_copy.')
    expect(modal().text()).toContain('indexes of the source could not be read')
  })

  it('creates no index after a failed batch, then creates them after a successful retry', async () => {
    serveSource(2500)
    mockListIndices.mockResolvedValue(SOURCE_INDEXES)
    mockInsertMany.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('bad'), { response: { status: 400 } })).mockResolvedValue({})
    mockGetInfo.mockResolvedValue({ count: 2500 })
    await mountCopy()
    await type('big_copy')
    await button('Copy').trigger('click')
    await wait(300)
    expect(mockCreateIndex).not.toHaveBeenCalled()
    expect(modal().text()).toContain('The indexes are created after a successful retry.')

    await button('Retry failed batches').trigger('click')
    await wait(300)
    expect(mockCreateIndex).toHaveBeenCalledTimes(2)
    expect(mockCreateIndex.mock.calls.every(c => c[0].collectionName === 'big_copy')).toBe(true)
    expect(modal().find('[data-test="copy-indexes"]').text()).toContain('Indexes created: 2')
  })
})

describe('MongocampCollectionCopy — quick backup', () => {
  const stamped = /^orders_backup_\d{8}_\d{6}$/

  it('is available without typing a name and copies everything under a timestamped name', async () => {
    mockGetInfo.mockResolvedValue({ count: 3 })
    const { done } = await mountCopy()
    expect(button('Quick backup').attributes('disabled')).toBeUndefined()
    expect(button('Quick backup').attributes('title')).toMatch(/Copies everything now into a new collection named orders_backup_\d{8}_\d{6}/)

    await button('Quick backup').trigger('click')
    await wait(150)

    const target = mockInsertMany.mock.calls[0]![0].collectionName as string
    expect(target).toMatch(stamped)
    expect(mockInsertMany.mock.calls[0]![0].requestBody).toEqual(docs(3))
    expect(modal().find('[data-test="copy-result"]').text()).toContain(`Copied 3 documents to ${target}.`)
    expect(modal().find('[data-test="copy-verified"]').exists()).toBe(true)
    expect(done).toEqual([{ target, copied: 3 }])
  })

  it('takes a free name when earlier backups exist', async () => {
    const taken = `orders_backup_${'0'.repeat(8)}_${'0'.repeat(6)}`
    mockListCollections.mockResolvedValue(['orders', 'users', taken])
    await mountCopy()
    await button('Quick backup').trigger('click')
    await wait(150)
    expect(mockInsertMany.mock.calls[0]![0].collectionName).toMatch(stamped)
  })

  it('copies only the matching documents of a filtered dialog', async () => {
    await mountCopy({ filter: 'status:open' })
    await button('Quick backup').trigger('click')
    await wait(150)
    expect(mockListDocumentsRaw.mock.calls.every(c => c[0].filter === 'status:open')).toBe(true)
  })

  it('is disabled above the cap and for a source that cannot be copied', async () => {
    serveSource(50_001)
    await mountCopy()
    expect(button('Quick backup').attributes('disabled')).toBeDefined()
  })

  it('shows the backup like any copy: progress, then a stop leaves it marked incomplete', async () => {
    serveSource(2500)
    let release!: () => void
    mockInsertMany.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({})
    }))
    await mountCopy()
    await button('Quick backup').trigger('click')
    await wait(100)
    expect(modal().find('[data-test="copy-progress"]').exists()).toBe(true)
    await button('Stop').trigger('click')
    release()
    await wait(200)
    expect(modal().text()).toMatch(/Stopped: 1000 of 2500 documents were copied; 1500 were not sent\. The new collection orders_backup_\d{8}_\d{6} is incomplete\./)
  })
})

describe('MongocampCollectionCopy — copying', () => {
  it('copies into the new collection, checks the count the server reports and emits done', async () => {
    mockGetInfo.mockResolvedValue({ count: 3 })
    const { done } = await mountCopy()
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait(150)

    expect(mockInsertMany).toHaveBeenCalledTimes(1)
    expect(mockInsertMany.mock.calls[0]![0].collectionName).toBe('orders_copy')
    expect(mockInsertMany.mock.calls[0]![0].requestBody).toEqual(docs(3))
    expect(modal().find('[data-test="copy-result"]').text()).toContain('Copied 3 documents to orders_copy.')
    expect(modal().find('[data-test="copy-verified"]').text()).toContain('holds 3 documents')
    expect(mockGetInfo).toHaveBeenCalledWith({ collectionName: 'orders_copy' })
    expect(done).toEqual([{ target: 'orders_copy', copied: 3 }])
  })

  it('warns when the new collection holds another number than was copied', async () => {
    mockGetInfo.mockResolvedValue({ count: 2 })
    await mountCopy()
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait(150)
    expect(modal().find('[data-test="copy-mismatch"]').text()).toContain('holds 2 documents, but 3 were copied')
  })

  it('goes back to the form when the name was taken meanwhile, and writes nothing', async () => {
    const { done } = await mountCopy()
    await type('orders_copy')
    mockListCollections.mockResolvedValue(['orders', 'users', 'orders_copy'])
    await button('Copy').trigger('click')
    await wait(150)
    expect(modal().text()).toContain('A collection named orders_copy exists now')
    expect(mockInsertMany).not.toHaveBeenCalled()
    expect(done).toEqual([])
    expect(button('Copy').attributes('disabled')).toBeDefined()
  })

  it('reports a failed batch with the document numbers, and Retry sends only those', async () => {
    serveSource(2500)
    mockInsertMany.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('bad'), { response: { status: 400 } })).mockResolvedValue({})
    mockGetInfo.mockResolvedValue({ count: 2500 })
    await mountCopy()
    await type('big_copy')
    await button('Copy').trigger('click')
    await wait(300)

    const text = modal().find('[data-test="copy-result"]').text()
    expect(text).toContain('1000 of 2500 documents could not be copied')
    expect(text).toContain('Documents 1001–2000')
    expect(text).toContain('big_copy is incomplete')
    expect(text).not.toContain('partly written') // a 400 is rejected before anything is written

    mockInsertMany.mockClear()
    await button('Retry failed batches').trigger('click')
    await wait(200)
    expect(mockInsertMany).toHaveBeenCalledTimes(1)
    expect(mockInsertMany.mock.calls[0]![0].requestBody[0]).toEqual({ _id: hex(1001), n: 1000 })
    expect(modal().find('[data-test="copy-result"]').text()).toContain('Copied 2500 documents to big_copy.')
  })

  it('warns that a failed batch may have been partly written when the failure is not a plain rejection', async () => {
    serveSource(10)
    mockInsertMany.mockRejectedValue(new Error('timeout'))
    await mountCopy()
    await type('x_copy')
    await button('Copy').trigger('click')
    await wait(200)
    expect(modal().text()).toContain('may have been partly written')
  })

  it('can be stopped; nothing is claimed complete', async () => {
    serveSource(2500)
    let release!: () => void
    mockInsertMany.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({})
    }))
    await mountCopy()
    await type('big_copy')
    await button('Copy').trigger('click')
    await wait(100)
    expect(modal().find('[data-test="copy-progress"]').exists()).toBe(true)

    await button('Stop').trigger('click')
    release()
    await wait(200)
    expect(modal().text()).toContain('Stopped: 1000 of 2500 documents were copied; 1500 were not sent. The new collection big_copy is incomplete.')
    expect(modal().text()).not.toContain('Copied 2500')
  })

  it('does not write a thing when stopped while reading', async () => {
    serveSource(2500)
    let release!: () => void
    const original = mockListDocumentsRaw.getMockImplementation()!
    mockListDocumentsRaw.mockImplementation(async (request: { rowsPerPage?: number }, init?: { signal?: AbortSignal }) => {
      if (request.rowsPerPage === 1) return original(request)
      await new Promise<void>((resolve) => {
        release = resolve
      })
      if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return original(request)
    })
    await mountCopy()
    await type('big_copy')
    await button('Copy').trigger('click')
    await wait(100)
    await button('Stop').trigger('click')
    release()
    await wait(150)
    expect(mockInsertMany).not.toHaveBeenCalled()
    expect(nameInput().exists()).toBe(true)
  })
})
