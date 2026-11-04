import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import MongocampCollectionData from '../../src/runtime/components/MongocampCollectionData.vue'
import MongocampQueryBar from '../../src/runtime/components/MongocampQueryBar.vue'
import MongocampExportAll from '../../src/runtime/components/MongocampExportAll.vue'

// UModal's close transition is timer-based, so a stale modal from a previous test can still
// be in document.body (which modal() queries globally) when the next test starts — force an
// immediate unmount between tests instead of waiting out the animation.
enableAutoUnmount(afterEach)

// See test/components/MongocampRoles.test.ts for why each of these helpers is needed.
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

function modal() {
  return new DOMWrapper(document.body)
}

function findInputByLabel(scope: DOMWrapper<Element>, labelText: string) {
  const label = scope.findAll('label').find(l => l.text() === labelText)
  const id = label?.attributes('for')
  if (!id) throw new Error(`No label found with text "${labelText}"`)
  return scope.find(`#${id}`)
}

const mockDownload = vi.hoisted(() => vi.fn())

vi.mock('../../src/runtime/utils/exportRows', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/runtime/utils/exportRows')>(),
  downloadTextFile: mockDownload,
}))

const mockListDocumentsRaw = vi.fn()
const mockGetDocumentRaw = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockUpdatePartial = vi.fn()
const mockUpdateMany = vi.fn()
const mockDistinctRaw = vi.fn()
const mockDeleteMany = vi.fn()
const mockDelete = vi.fn()
const mockGetFileInformation = vi.fn()
const mockGetFile = vi.fn()
const mockInsertFile = vi.fn()
const mockCreateIndexForField = vi.fn()
const session: { isAdmin: boolean, grants?: unknown } = { isAdmin: false }

function mockRawResponse<T>(value: T, totalHeader?: string) {
  return {
    raw: { headers: { get: (name: string) => (name === 'x-pagination-count-rows' ? (totalHeader ?? null) : null) } },
    value: () => Promise.resolve(value),
  }
}

// useMongocampApi is a genuine Nuxt auto-import (from '#imports', re-exported by
// @sfxcode/nuxt-mongocamp-server) — unlike this module's own composables (imported via
// relative paths, mocked with plain vi.mock elsewhere), so mockNuxtImport is the right tool
// here. It also covers useMongocampBucket's internal useMongocampApi() call, since both
// resolve through the same auto-import binding.
mockNuxtImport('useMongocampApi', () => {
  return () => ({
    documentApi: {
      listDocumentsRaw: mockListDocumentsRaw,
      getDocumentRaw: mockGetDocumentRaw,
      insert: mockInsert,
      update: mockUpdate,
      updateDocumentPartial: mockUpdatePartial,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
      _delete: mockDelete,
    },
    fileApi: {
      getFileInformation: mockGetFileInformation,
      getFile: mockGetFile,
      insertFile: mockInsertFile,
    },
    bucketApi: {},
    collectionApi: { distinctRaw: mockDistinctRaw },
    indexApi: { createIndexForField: mockCreateIndexForField },
  })
})

// who is signed in decides whether the header index menu is offered
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'alice@example.com', isAdmin: session.isAdmin, roles: [], grants: session.grants } } }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear() // remembered table state must not leak between tests
  session.isAdmin = false
  session.grants = undefined
  mockListDocumentsRaw.mockResolvedValue(mockRawResponse([], '0'))
  mockUpdatePartial.mockResolvedValue({ wasAcknowledged: true, matchedCount: 1, modifiedCount: 1 })
})

describe('MongocampCollectionData', () => {
  describe('export all matching', () => {
    it('hands the list\'s filter, sort, fields and match count to the export dialog', async () => {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse([{ _id: 'a'.repeat(24), name: 'Alice', age: 30 }], '45'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      component.findComponent(MongocampQueryBar).vm.$emit('apply', { filterGroup: { match: 'all', conditions: [] }, lucene: 'name:"Alice"', sort: ['-age'], projection: ['name'] })
      await wait()

      const dialog = component.findComponent(MongocampExportAll)
      expect(dialog.exists()).toBe(true)
      expect(dialog.props()).toMatchObject({ collection: 'customers', filter: 'name:"Alice"', sort: ['-age'], projection: ['name'], total: 45, open: false })
    })
  })

  describe('compare two documents', () => {
    const rows = [1, 2, 3].map(n => ({ _id: n.toString(16).padStart(24, '0'), name: `n${n}`, age: n }))
    async function mountWithRows() {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows, '3'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      return component
    }
    const compareButton = (c: Awaited<ReturnType<typeof mountWithRows>>) => c.find('[data-testid="compare-selected"]')

    it('offers Compare selected for exactly two ticked rows and shows their differences', async () => {
      const component = await mountWithRows()
      const boxes = component.findAll('[aria-label="Select row"]')
      await boxes[0]!.trigger('click')
      expect(compareButton(component).exists()).toBe(false)
      await boxes[1]!.trigger('click')
      expect(compareButton(component).exists()).toBe(true)

      await compareButton(component).trigger('click')
      await wait()
      const compare = document.body.querySelector('[data-testid="document-compare"]')
      expect(compare?.querySelector('[data-path="name"]')?.getAttribute('data-status')).toBe('changed')
    })

    it('hides it again with three rows ticked', async () => {
      const component = await mountWithRows()
      for (const box of component.findAll('[aria-label="Select row"]')) await box.trigger('click')
      expect(compareButton(component).exists()).toBe(false)
    })
  })

  describe('select all matching', () => {
    const hex = (n: number) => n.toString(16).padStart(24, '0')
    const pageRows = [1, 2, 3].map(n => ({ _id: hex(n), name: `n${n}` }))
    const isIdCall = (request: { projection?: string[] }) => request.projection?.[0] === '_id'

    // the table shows 3 rows of `total` matches; a projection-by-_id request is the id collection, answered by `ids`
    function serve(total: number, ids: () => string[] | Promise<string[]> = () => Array.from({ length: total }, (_, i) => hex(i + 1)), idTotal = total) {
      mockListDocumentsRaw.mockImplementation(async (request: { projection?: string[], page?: number }, init?: { signal?: AbortSignal }) => {
        if (!isIdCall(request)) return mockRawResponse(pageRows, String(total))
        const all = await ids()
        if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        const pageSize = 1000
        const page = request.page ?? 1
        return mockRawResponse(all.slice((page - 1) * pageSize, page * pageSize).map(_id => ({ _id })), String(idTotal))
      })
    }

    async function mountAndSelectPage() {
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      await component.find('[aria-label="Select all rows on this page"]').trigger('click')
      return component
    }
    const idCalls = () => mockListDocumentsRaw.mock.calls.filter(c => isIdCall(c[0]))
    const button = (c: Awaited<ReturnType<typeof mountAndSelectPage>>, label: string) => c.findAll('button').find(b => b.text() === label)

    it('offers it only when the whole page is selected and more documents match', async () => {
      serve(45)
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      await component.findAll('[aria-label="Select row"]')[0]!.trigger('click')
      expect(component.find('[data-test="select-all-banner"]').exists()).toBe(false)

      await component.find('[aria-label="Select all rows on this page"]').trigger('click')
      expect(component.find('[data-test="select-all-banner"]').text()).toContain('All 3 documents on this page are selected.')
      expect(component.text()).toContain('Select all 45 matching documents')
    })

    it('does not offer it when the page already holds everything', async () => {
      serve(3)
      const component = await mountAndSelectPage()
      expect(component.text()).toContain('3 selected')
      expect(component.find('[data-test="select-all-banner"]').exists()).toBe(false)
    })

    it('collects the ids of the current filter in pages of 1000 — ids only — and selects them all', async () => {
      serve(45)
      const component = await mountAndSelectPage()
      await button(component, 'Select all 45 matching documents')!.trigger('click')
      await wait()

      expect(idCalls()).toHaveLength(1)
      expect(idCalls()[0]![0]).toMatchObject({ collectionName: 'customers', projection: ['_id'], rowsPerPage: 1000, page: 1 })
      expect(component.text()).toContain('All 45 matching documents are selected.')
      expect(component.find('[data-test="select-all-banner"]').exists()).toBe(false)
    })

    it('collects with the filter the table is showing', async () => {
      serve(45)
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      await component.find('input[placeholder="Filter rows..."]').setValue('ali')
      await wait(450)
      await component.find('[aria-label="Select all rows on this page"]').trigger('click')
      await button(component as never, 'Select all 45 matching documents')!.trigger('click')
      await wait()
      expect(idCalls()[0]![0].filter).toBe(mockListDocumentsRaw.mock.calls.filter(c => !isIdCall(c[0])).at(-1)![0].filter)
      expect(idCalls()[0]![0].filter).toContain('ali')
    })

    it('refuses above the cap without reading anything', async () => {
      serve(10_001)
      const component = await mountAndSelectPage()
      await button(component, 'Select all 10001 matching documents')!.trigger('click')
      await wait()
      expect(idCalls()).toHaveLength(0)
      expect(component.find('[data-test="bulk-note"]').text()).toContain('10001 documents match, more than the 10000')
      expect(component.text()).not.toContain('matching documents are selected')
    })

    it('can be cancelled while collecting, and then nothing is selected', async () => {
      let release!: () => void
      serve(45, () => new Promise<string[]>((resolve) => {
        release = () => resolve([])
      }))
      const component = await mountAndSelectPage()
      await button(component, 'Select all 45 matching documents')!.trigger('click')
      await wait()
      expect(component.find('[data-test="collecting"]').text()).toContain('Collecting ids')

      await component.find('[data-test="collecting"] button').trigger('click')
      release()
      await wait()
      expect(component.find('[data-test="collecting"]').exists()).toBe(false)
      expect(component.text()).not.toContain('matching documents are selected')
      expect(component.find('[data-test="bulk-note"]').exists()).toBe(false)
    })

    it('says so when fewer ids were found than the list reported', async () => {
      serve(45, () => Array.from({ length: 40 }, (_, i) => hex(i + 1)), 45)
      const component = await mountAndSelectPage()
      await button(component, 'Select all 45 matching documents')!.trigger('click')
      await wait()
      expect(component.text()).toContain('All 40 matching documents are selected.')
      expect(component.find('[data-test="bulk-note"]').text()).toContain('40 documents were found; the list reported 45')
    })

    it('does not keep the selection when the list is reloaded', async () => {
      serve(45)
      const component = await mountAndSelectPage()
      await button(component, 'Select all 45 matching documents')!.trigger('click')
      await wait()
      await component.find('[aria-label="Reload"]').trigger('click')
      await wait()
      expect(component.text()).not.toContain('matching documents are selected')
    })

    describe('deleting', () => {
      async function selectAll(total: number) {
        serve(total)
        mockDeleteMany.mockImplementation(async (request: { requestBody: { $or: unknown[] } }) => ({ deletedCount: request.requestBody.$or.length }))
        const component = await mountAndSelectPage()
        await button(component, `Select all ${total} matching documents`)!.trigger('click')
        await wait()
        await button(component, 'Delete selected')!.trigger('click')
        await wait()
        return component
      }
      const confirm = (total: number) => modal().findAll('button').find(b => b.text() === `Delete ${total}`)!

      it('needs the collection name typed, then deletes every id in chunks of 100 and reports the count', async () => {
        const component = await selectAll(250)
        expect(modal().text()).toContain('type the collection name customers')
        expect(confirm(250).attributes('disabled')).toBeDefined()
        await confirm(250).trigger('click')
        expect(mockDeleteMany).not.toHaveBeenCalled()

        await modal().find('input[aria-label="Collection name"]').setValue('wrong')
        expect(confirm(250).attributes('disabled')).toBeDefined()
        await modal().find('input[aria-label="Collection name"]').setValue('customers')
        await wait()
        expect(confirm(250).attributes('disabled')).toBeUndefined()
        await confirm(250).trigger('click')
        await wait(150)

        expect(mockDeleteMany).toHaveBeenCalledTimes(3)
        expect(mockDeleteMany.mock.calls.map(c => c[0].requestBody.$or.length)).toEqual([100, 100, 50])
        expect(mockDeleteMany.mock.calls[0]![0].requestBody.$or[0]).toEqual({ _id: hex(1) })
        expect(component.text()).not.toContain('matching documents are selected')
      })

      it('does not ask for the name when only the rows on screen are selected', async () => {
        serve(45)
        mockDeleteMany.mockResolvedValue({ deletedCount: 3 })
        const component = await mountAndSelectPage()
        await button(component, 'Delete selected')!.trigger('click')
        await wait()
        expect(modal().find('input[aria-label="Collection name"]').exists()).toBe(false)
        expect(modal().findAll('button').find(b => b.text() === 'Delete 3')!.attributes('disabled')).toBeUndefined()
      })

      it('can be stopped between chunks; what was not touched stays selected and is reported', async () => {
        const component = await selectAll(250)
        let release!: () => void
        mockDeleteMany.mockImplementationOnce(() => new Promise((resolve) => {
          release = () => resolve({ deletedCount: 100 })
        }))
        await modal().find('input[aria-label="Collection name"]').setValue('customers')
        await wait()
        await confirm(250).trigger('click')
        await wait()
        expect(modal().find('[data-test="delete-progress"]').text()).toContain('Deleted 0 of 250')

        await modal().findAll('button').find(b => b.text() === 'Stop')!.trigger('click')
        release()
        await wait(150)

        expect(mockDeleteMany).toHaveBeenCalledTimes(1)
        expect(modal().text()).toContain('Stopped: 100 of 250 deleted. The other 150 were not touched.')
        expect(component.text()).toContain('All 150 matching documents are selected.')
      })

      it('keeps the ids that could not be deleted selected and says why', async () => {
        const component = await selectAll(150)
        mockDeleteMany.mockReset()
        mockDeleteMany.mockResolvedValueOnce({ deletedCount: 100 }).mockRejectedValue(new Error('forbidden'))
        mockDelete.mockRejectedValue(new Error('forbidden'))
        await modal().find('input[aria-label="Collection name"]').setValue('customers')
        await wait()
        await confirm(150).trigger('click')
        await wait(200)
        expect(modal().text()).toContain('50 of 150 could not be deleted')
        expect(component.text()).toContain('All 50 matching documents are selected.')
      })
    })

    describe('editing', () => {
      it('updates every collected id in chunks and shows progress', async () => {
        serve(250)
        mockUpdateMany.mockImplementation(async () => ({ matchedCount: 100 }))
        const component = await mountAndSelectPage()
        await button(component, 'Select all 250 matching documents')!.trigger('click')
        await wait()
        await button(component, 'Edit selected')!.trigger('click')
        await wait()
        await modal().find('input[aria-label="Value"]').setValue('X')
        await wait()
        await modal().findAll('button').find(b => b.text() === 'Update 250')!.trigger('click')
        await wait(150)
        expect(mockUpdateMany).toHaveBeenCalledTimes(3)
        expect(mockUpdateMany.mock.calls[0]![0].updateRequest.filter.$or).toHaveLength(100)
        expect(mockUpdateMany.mock.calls.map(c => c[0].updateRequest.filter.$or.length)).toEqual([100, 100, 50])
      })
    })
  })

  describe('query bar: sort and fields to load', () => {
    const rows = [
      { _id: { $oid: 'a'.repeat(24) }, name: 'Alice', age: 30, city: 'X' },
      { _id: { $oid: 'b'.repeat(24) }, name: 'Bob', age: 25, city: 'Y' },
    ]
    const stateWith = (patch: Record<string, unknown>) => ({ filterGroup: { match: 'all', conditions: [] }, lucene: '', sort: [], projection: [], ...patch })

    async function mountRows() {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows, '2'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      return component
    }
    const apply = async (component: Awaited<ReturnType<typeof mountRows>>, patch: Record<string, unknown>) => {
      component.findComponent(MongocampQueryBar).vm.$emit('apply', stateWith(patch))
      await wait()
    }

    it('sends the sort the bar applied and goes back to page 1', async () => {
      const component = await mountRows()
      mockListDocumentsRaw.mockClear()
      await apply(component, { sort: ['-age'] })
      expect(mockListDocumentsRaw).toHaveBeenCalledTimes(1)
      expect(mockListDocumentsRaw.mock.calls[0]![0]).toMatchObject({ sort: ['-age'], page: 1 })
    })

    it('loads only the chosen fields and hides the others, but never sends an empty projection', async () => {
      const component = await mountRows()
      expect(mockListDocumentsRaw.mock.calls[0]![0].projection).toBeUndefined()
      mockListDocumentsRaw.mockClear()
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows.map(r => ({ _id: r._id, name: r.name })), '2'))
      await apply(component, { projection: ['name'] })
      expect(mockListDocumentsRaw.mock.calls[0]![0].projection).toEqual(['name'])
      const headers = component.findAll('th').map(th => th.text())
      expect(headers).toContain('name')
      expect(headers).toContain('_id')
      expect(headers).not.toContain('age')
      expect(headers).not.toContain('city')

      mockListDocumentsRaw.mockClear()
      await apply(component, { projection: [] })
      expect(mockListDocumentsRaw.mock.calls[0]![0].projection).toBeUndefined()
      expect(component.findAll('th').map(th => th.text())).toContain('age')
    })

    it('ignores fields of a restored query that the collection does not have', async () => {
      const component = await mountRows()
      mockListDocumentsRaw.mockClear()
      await apply(component, { projection: ['name', 'ghost'] })
      expect(mockListDocumentsRaw.mock.calls[0]![0].projection).toEqual(['name'])
      mockListDocumentsRaw.mockClear()
      await apply(component, { projection: ['ghost'] })
      expect(mockListDocumentsRaw.mock.calls[0]![0].projection).toBeUndefined()
    })

    it('does not remember projected-out columns as hidden', async () => {
      const component = await mountRows()
      await apply(component, { projection: ['name'] })
      expect(localStorage.getItem('nuxt-ui-mongocamp:collectionData:customers') ?? '').not.toContain('city')
    })

    it('edits a projected row from the full document, not from the partial one', async () => {
      const component = await mountRows()
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse([{ _id: rows[0]!._id, name: 'Alice' }], '1'))
      await apply(component, { projection: ['name'] })
      mockGetDocumentRaw.mockResolvedValue({ raw: new Response(JSON.stringify({ _id: 'a'.repeat(24), name: 'Alice', age: 30, city: 'X' })), value: () => Promise.resolve({}) })

      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()

      expect(mockGetDocumentRaw).toHaveBeenCalledWith({ collectionName: 'customers', documentId: 'a'.repeat(24) })
      expect((findInputByLabel(modal(), 'Age').element as HTMLInputElement).value).toBe('30')
      expect((findInputByLabel(modal(), 'City').element as HTMLInputElement).value).toBe('X')
    })

    it('does not open the edit form when the full document cannot be loaded', async () => {
      const component = await mountRows()
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse([{ _id: rows[0]!._id, name: 'Alice' }], '1'))
      await apply(component, { projection: ['name'] })
      mockGetDocumentRaw.mockRejectedValue(new Error('boom'))
      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()
      expect(modal().find('button[type="submit"]').exists()).toBe(false)
    })

    it('edits an ordinary row without an extra request', async () => {
      const component = await mountRows()
      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()
      expect(mockGetDocumentRaw).not.toHaveBeenCalled()
    })
  })

  describe('document view', () => {
    const rows = [
      { _id: { $oid: 'a'.repeat(24) }, name: 'Alice', big: { $numberLong: '9007199254740993' }, nested: { city: 'X' } },
      { _id: { $oid: 'b'.repeat(24) }, name: 'Bob', big: 1, nested: { city: 'Y' } },
    ]

    async function mountRows() {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse(rows, '2'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      return component
    }

    it('offers View on a row, also without a write grant, and opens the typed document in a drawer', async () => {
      session.grants = [{ collection: 'customers', read: true, write: false }]
      const component = await mountRows()
      expect(component.findAll('[aria-label="Edit document"]')).toHaveLength(0)

      await component.findAll('[aria-label="View document"]')[0]!.trigger('click')
      await wait()
      const drawer = modal().text()
      expect(drawer).toContain('objectId')
      expect(drawer).toContain('9007199254740993')
    })

    it('shows the page as JSON with exact longs and back as a table', async () => {
      const component = await mountRows()
      await component.findAll('button').find(b => b.text() === 'JSON')!.trigger('click')
      const json = component.find('[data-test="page-json"]').text()
      expect(json).toContain('"big": 9007199254740993')
      expect(json).toContain('"name": "Bob"')
      expect(component.find('table').exists()).toBe(false)

      await component.findAll('button').find(b => b.text() === 'Table')!.trigger('click')
      expect(component.find('table').exists()).toBe(true)
      expect(component.find('[data-test="page-json"]').exists()).toBe(false)
    })
  })

  describe('remembered table state', () => {
    async function mountData(props: Record<string, unknown> = {}) {
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers', ...props },
      })
      await wait()
      return component
    }

    it('keeps the page size across a remount', async () => {
      const first = await mountData()
      first.findComponent(USelect).vm.$emit('update:modelValue', 50)
      await wait()
      first.unmount()

      mockListDocumentsRaw.mockClear()
      await mountData()
      expect(mockListDocumentsRaw.mock.calls[0]![0].rowsPerPage).toBe(50)
    })

    it('keeps it per collection', async () => {
      const first = await mountData()
      first.findComponent(USelect).vm.$emit('update:modelValue', 50)
      await wait()
      first.unmount()

      mockListDocumentsRaw.mockClear()
      await mountData({ collectionName: 'orders' })
      expect(mockListDocumentsRaw.mock.calls[0]![0].rowsPerPage).toBe(20)
    })

    it('does not remember anything with persistState off', async () => {
      const first = await mountData({ persistState: false })
      first.findComponent(USelect).vm.$emit('update:modelValue', 50)
      await wait()
      first.unmount()

      expect(localStorage.length).toBe(0)
      mockListDocumentsRaw.mockClear()
      await mountData({ persistState: false })
      expect(mockListDocumentsRaw.mock.calls[0]![0].rowsPerPage).toBe(20)
    })

    it('separates two tables over one collection by stateKey', async () => {
      const first = await mountData({ stateKey: 'a' })
      first.findComponent(USelect).vm.$emit('update:modelValue', 100)
      await wait()
      first.unmount()

      mockListDocumentsRaw.mockClear()
      await mountData({ stateKey: 'b' })
      expect(mockListDocumentsRaw.mock.calls[0]![0].rowsPerPage).toBe(20)
    })

    it('restores a remembered sort and ignores a malformed entry', async () => {
      localStorage.setItem('nuxt-ui-mongocamp:collectionData:customers', JSON.stringify({ v: 1, data: { pageSize: 50, sort: [{ id: 'name', desc: true }, 7, { id: '' }] } }))
      await mountData()
      expect(mockListDocumentsRaw.mock.calls[0]![0]).toMatchObject({ rowsPerPage: 50, sort: ['-name'] })
    })

    it('restores hidden columns', async () => {
      localStorage.setItem('nuxt-ui-mongocamp:collectionData:customers', JSON.stringify({ v: 1, data: { hidden: ['age'] } }))
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-1', name: 'Alice', age: 30 }], '1'))
      const component = await mountData()
      const headers = component.findAll('th').map(th => th.text())
      expect(headers).toContain('name')
      expect(headers).not.toContain('age')
    })

    it('falls back to the defaults for an unusable page size or corrupt JSON', async () => {
      localStorage.setItem('nuxt-ui-mongocamp:collectionData:customers', JSON.stringify({ v: 1, data: { pageSize: 7, sort: 'x', hidden: 3 } }))
      await mountData()
      expect(mockListDocumentsRaw.mock.calls[0]![0]).toMatchObject({ rowsPerPage: 20, sort: undefined })

      localStorage.setItem('nuxt-ui-mongocamp:collectionData:customers', '{not json')
      mockListDocumentsRaw.mockClear()
      await mountData()
      expect(mockListDocumentsRaw.mock.calls[0]![0].rowsPerPage).toBe(20)
    })
  })

  it('fetches the first page on mount and derives columns from the first row\'s keys', async () => {
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([
      { _id: 'doc-1', name: 'Alice', age: 30, metaData: { created: '2024-01-01T00:00:00.000Z' } },
      { _id: 'doc-2', name: 'Bob', age: 25, metaData: { created: '2024-01-02T00:00:00.000Z' } },
    ], '2'))

    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()

    expect(mockListDocumentsRaw).toHaveBeenCalledWith({
      collectionName: 'customers',
      rowsPerPage: 20,
      page: 1,
      sort: undefined,
      filter: undefined,
    })
    expect(component.text()).toContain('Alice')
    expect(component.text()).toContain('Bob')
    expect(component.text()).toContain('2 documents')

    // column order: _id first, alphabetical, metaData last (brain/patterns/schema-driven-table.md)
    const headers = component.findAll('th').map(th => th.text())
    expect(headers.indexOf('_id')).toBeLessThan(headers.indexOf('age'))
    expect(headers.indexOf('age')).toBeLessThan(headers.indexOf('name'))
    expect(headers.indexOf('name')).toBeLessThan(headers.indexOf('metaData'))
  })

  it('offers document import for an ordinary collection', async () => {
    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()

    expect(component.find('[aria-label="Import documents"]').exists()).toBe(true)
  })

  it('formats ISO date strings in the first row as localized dates, not raw ISO text', async () => {
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([
      { _id: 'doc-1', name: 'Alice', dateCreated: '2016-11-28T15:19:07.021Z' },
    ], '1'))

    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()

    expect(component.text()).not.toContain('2016-11-28T15:19:07.021Z')
    expect(component.text()).toContain(new Date('2016-11-28T15:19:07.021Z').toLocaleString())
  })

  it('re-fetches page 1 with the chosen rowsPerPage when the page size changes', async () => {
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-1', name: 'Alice' }], '1'))
    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()

    // Reka UI's select commits via pointer events that happy-dom doesn't reproduce faithfully, so
    // drive the component's own v-model contract instead; the real interaction is checked in a browser.
    const select = component.findComponent(USelect)
    expect(select.exists()).toBe(true)
    select.vm.$emit('update:modelValue', 50)
    await wait()

    const lastCallArgs = mockListDocumentsRaw.mock.calls.at(-1)![0]
    expect(lastCallArgs.rowsPerPage).toBe(50)
    expect(lastCallArgs.page).toBe(1)
  })

  it('debounces the filter input and re-fetches page 1 with a Lucene filter over string columns', async () => {
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-1', name: 'Alice' }], '1'))
    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-1', name: 'Alice' }], '1'))

    await component.find('input[placeholder="Filter rows..."]').setValue('ali')
    await wait(400) // filter is debounced 300ms

    expect(mockListDocumentsRaw).toHaveBeenCalledTimes(2)
    const secondCallArgs = mockListDocumentsRaw.mock.calls[1]![0]
    expect(secondCallArgs.page).toBe(1)
    expect(secondCallArgs.filter).toContain('ali')
  })

  it('re-fetches with a sort parameter when a sortable column header is clicked', async () => {
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-1', name: 'Alice' }], '1'))
    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-1', name: 'Alice' }], '1'))

    const nameHeaderButton = component.findAll('button').find(b => b.text().includes('name'))
    await nameHeaderButton?.trigger('click')
    await wait()

    const lastCallArgs = mockListDocumentsRaw.mock.calls.at(-1)![0]
    expect(lastCallArgs.sort).toEqual(['name'])
  })

  it('re-fetches the requested page when pagination changes', async () => {
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse(
      Array.from({ length: 20 }, (_, i) => ({ _id: `doc-${i}`, name: `Row ${i}` })),
      '45',
    ))
    const component = await mountSuspended(withUApp(MongocampCollectionData), {
      route: '/',
      props: { collectionName: 'customers' },
    })
    await wait()
    mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: 'doc-20', name: 'Row 20' }], '45'))

    const page2Button = component.findAll('button').find(b => b.text().trim() === '2')
    await page2Button?.trigger('click')
    await wait()

    const lastCallArgs = mockListDocumentsRaw.mock.calls.at(-1)![0]
    expect(lastCallArgs.page).toBe(2)
  })

  describe('insert', () => {
    it('infers a form from the loaded page, stamps metaData, and never sends _id', async () => {
      // A string-only sample keeps this test focused on _id-stripping/metaData-stamping —
      // driving Nuxt UI's number-stepper input is a separate, unrelated interaction concern.
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: { $oid: 'doc-1' }, name: 'Alice' }], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()

      await component.find('[aria-label="Insert document"]').trigger('click')
      await wait()

      await findInputByLabel(modal(), 'Name').setValue('Charlie')
      await wait()
      await modal().find('button[type="submit"]').trigger('click')
      await wait()

      expect(mockInsert).toHaveBeenCalledTimes(1)
      const { collectionName, requestBody } = mockInsert.mock.calls[0]![0]
      expect(collectionName).toBe('customers')
      expect(requestBody._id).toBeUndefined()
      expect(requestBody.name).toBe('Charlie')
      expect(requestBody.metaData.createdBy).toBeDefined()
      expect(requestBody.metaData.updatedBy).toBeDefined()
      // FormKit's internal `slots` entry must not leak into the stored document
      expect(requestBody).not.toHaveProperty('slots')
    })
  })

  describe('edit', () => {
    async function openEdit(rows: unknown[]) {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse(rows, String(rows.length)))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()
      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()
      return component
    }
    const submit = async () => {
      await modal().find('button[type="submit"]').trigger('click')
      await wait()
    }

    it('pre-fills the form from the row and sends only the changed field as a partial update', async () => {
      await openEdit([{ _id: { $oid: 'doc-1' }, name: 'Alice', age: 30, legacyFlag: true, metaData: { createdBy: 'bob', updatedBy: 'bob', created: '2024-01-01T00:00:00.000Z', updated: '2024-01-01T00:00:00.000Z' } }])

      expect((findInputByLabel(modal(), 'Name').element as HTMLInputElement).value).toBe('Alice')

      await findInputByLabel(modal(), 'Name').setValue('Alice Updated')
      await wait()
      await submit()

      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockUpdatePartial).toHaveBeenCalledTimes(1)
      const { collectionName, documentId, requestBody } = mockUpdatePartial.mock.calls[0]![0]
      expect(collectionName).toBe('customers')
      expect(documentId).toBe('doc-1')
      // fields the user did not touch (age, legacyFlag, _id) are not part of the request at all
      expect(requestBody.name).toBe('Alice Updated')
      expect(requestBody).not.toHaveProperty('age')
      expect(requestBody).not.toHaveProperty('legacyFlag')
      expect(requestBody).not.toHaveProperty('_id')
      expect(requestBody).not.toHaveProperty('slots')
      // the stamp goes in as dotted leaves, so createdBy/created are left alone
      expect(requestBody['metaData.updatedBy']).toBe('alice@example.com')
      expect(requestBody['metaData.updated']).toBeDefined()
      expect(requestBody).not.toHaveProperty('metaData')
      expect(requestBody).not.toHaveProperty('metaData.createdBy')
    })

    it('closes without any request when nothing was changed', async () => {
      await openEdit([{ _id: { $oid: 'doc-1' }, name: 'Alice' }])

      await submit()

      expect(mockUpdatePartial).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
      // (the dialog's close transition keeps it in the DOM for a moment, so only the absence of an error is checked)
      expect(modal().text()).not.toContain('Error saving document')
    })

    it('shows an error and keeps the dialog open when the document no longer exists (matchedCount 0)', async () => {
      mockUpdatePartial.mockResolvedValueOnce({ wasAcknowledged: true, matchedCount: 0, modifiedCount: 0 })
      await openEdit([{ _id: { $oid: 'doc-1' }, name: 'Alice' }])

      await findInputByLabel(modal(), 'Name').setValue('Alice Updated')
      await wait()
      await submit()

      expect(modal().text()).toContain('The document no longer exists.')
    })

    it('shows the server error and keeps the dialog open when the request fails', async () => {
      mockUpdatePartial.mockRejectedValueOnce(new Error('boom'))
      await openEdit([{ _id: { $oid: 'doc-1' }, name: 'Alice' }])

      await findInputByLabel(modal(), 'Name').setValue('Alice Updated')
      await wait()
      await submit()

      expect(modal().text()).toContain('boom')
    })
  })

  describe('without a write grant (UI-level, from the grants of the profile)', () => {
    const grant = (name: string, write: boolean) => ({ name, read: true, write, administrate: false, grantType: 'COLLECTION' })

    async function mountCustomers() {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: { $oid: 'doc-1' }, name: 'Alice' }], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      return component
    }
    const writeControls = (component: Awaited<ReturnType<typeof mountCustomers>>) => ({
      insert: component.find('[aria-label="Insert document"]').exists(),
      import: component.find('[aria-label="Import documents"]').exists() || component.text().includes('Import documents'),
      edit: component.find('[aria-label="Edit document"]').exists(),
      remove: component.find('[aria-label="Delete document"]').exists(),
      select: component.find('[aria-label="Select row"]').exists(),
    })

    it('a read-only grant: rows are shown, but no insert, import, edit, delete or selection', async () => {
      session.grants = [grant('customers', false)]
      const component = await mountCustomers()

      expect(component.text()).toContain('Alice')
      expect(writeControls(component)).toEqual({ insert: false, import: false, edit: false, remove: false, select: false })
    })

    it('a write grant: every write control is there', async () => {
      session.grants = [grant('customers', true)]
      const component = await mountCustomers()

      expect(writeControls(component)).toEqual({ insert: true, import: true, edit: true, remove: true, select: true })
    })

    it('the grant name is matched like the server does: ignoring case, exact otherwise', async () => {
      session.grants = [grant('CUSTOMERS', true)]
      expect(writeControls(await mountCustomers()).insert).toBe(true)

      session.grants = [grant('cust*', true), grant('customers_archive', true)]
      expect(writeControls(await mountCustomers()).insert).toBe(false)
    })

    it('an administrator keeps every control, whatever the grants say', async () => {
      session.isAdmin = true
      session.grants = []
      const component = await mountCustomers()

      expect(writeControls(component)).toEqual({ insert: true, import: true, edit: true, remove: true, select: true })
    })

    it('shows everything when the profile has no grant list — fail open, the server decides', async () => {
      session.grants = undefined
      const component = await mountCustomers()

      expect(writeControls(component)).toEqual({ insert: true, import: true, edit: true, remove: true, select: true })
    })
  })

  describe('export of the page on screen', () => {
    async function openExportMenu(rows: string) {
      const raw = new Response(rows, { headers: { 'x-pagination-count-rows': '2' } })
      mockListDocumentsRaw.mockResolvedValueOnce({ raw, value: () => raw.json() })
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      await component.find('[aria-label="Export this page"]').trigger('click')
      await wait()
      return component
    }
    const menuItem = (label: string) => Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(el => el.textContent?.includes(label)) as HTMLElement | undefined

    it('JSON: the documents as the table shows them, indented, with an exact long written as a bare number', async () => {
      await openExportMenu('[{"_id":"a","name":"Alice","big":9007199254740993},{"_id":"b","name":"Bob","big":5}]')

      menuItem('Export page as JSON')!.click()
      await wait()

      expect(mockDownload).toHaveBeenCalledTimes(1)
      const [filename, content, mime] = mockDownload.mock.calls[0]!
      expect(filename).toBe('customers.json')
      expect(mime).toBe('application/json')
      expect(content).toContain('"big": 9007199254740993')
      expect(content).toBe('[\n  {\n    "_id": "a",\n    "name": "Alice",\n    "big": 9007199254740993\n  },\n  {\n    "_id": "b",\n    "name": "Bob",\n    "big": 5\n  }\n]')
    })

    it('CSV: a header, the visible columns and the digits of an exact long', async () => {
      await openExportMenu('[{"_id":"a","name":"Alice","big":9007199254740993}]')

      menuItem('Export page as CSV')!.click()
      await wait()

      const [filename, content, mime] = mockDownload.mock.calls[0]!
      expect(filename).toBe('customers.csv')
      expect(mime).toBe('text/csv')
      expect(content).toContain('9007199254740993')
      expect(content).toContain('Alice')
    })
  })

  describe('64-bit integers beyond 2^53', () => {
    // a real Response: the generated client's own value() would round the digits, the component reads the text instead
    function longResponse(text: string) {
      const raw = new Response(text, { headers: { 'x-pagination-count-rows': '1' } })
      return { raw, value: () => raw.json() }
    }

    async function mountWithLong() {
      mockListDocumentsRaw.mockResolvedValueOnce(longResponse('[{"_id":"doc-1","name":"Alice","big":9007199254740993}]'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      return component
    }

    it('shows the exact digits in the table', async () => {
      const component = await mountWithLong()

      expect(component.text()).toContain('9007199254740993')
      expect(component.text()).not.toContain('9007199254740992')
    })

    it('shows the exact digits in the edit form and leaves the long out of the request when another field is edited', async () => {
      const component = await mountWithLong()
      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()

      expect((findInputByLabel(modal(), 'Big').element as HTMLInputElement).value).toBe('9007199254740993')

      await findInputByLabel(modal(), 'Name').setValue('Alice Updated')
      await wait()
      await modal().find('button[type="submit"]').trigger('click')
      await wait()

      const { requestBody } = mockUpdatePartial.mock.calls[0]![0]
      expect(requestBody.name).toBe('Alice Updated')
      expect(requestBody).not.toHaveProperty('big')
    })

    it('sends an edited long as a $numberLong wrapper, so it stays a 64-bit integer', async () => {
      const component = await mountWithLong()
      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()

      await findInputByLabel(modal(), 'Big').setValue('9007199254740995')
      await wait()
      await modal().find('button[type="submit"]').trigger('click')
      await wait()

      const { requestBody } = mockUpdatePartial.mock.calls[0]![0]
      expect(requestBody.big).toEqual({ $numberLong: '9007199254740995' })
      expect(requestBody).not.toHaveProperty('name')
    })
  })

  describe('empty collection fallback', () => {
    it('falls back to a raw-JSON textarea when no rows are loaded, and inserts the parsed JSON', async () => {
      // beforeEach already defaults listDocumentsRaw to an empty page
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()

      await component.find('[aria-label="Insert document"]').trigger('click')
      await wait()

      expect(modal().find('textarea').exists()).toBe(true)
      await modal().find('textarea').setValue('{"name": "Dana"}')

      const insertFooterButton = modal().findAll('button').find(b => b.text() === 'Insert')
      await insertFooterButton?.trigger('click')
      await wait()

      // ensureMetaData stamps metaData even on the raw-JSON fallback path, so requestBody has
      // more than just what was typed — only assert the parsed JSON's own field made it through.
      expect(mockInsert).toHaveBeenCalledTimes(1)
      const { collectionName, requestBody } = mockInsert.mock.calls[0]![0]
      expect(collectionName).toBe('customers')
      expect(requestBody.name).toBe('Dana')
    })
  })

  describe('delete', () => {
    it('confirming the modal calls documentApi._delete with the row id', async () => {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: { $oid: 'doc-1' }, name: 'Alice' }], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()

      await component.find('[aria-label="Delete document"]').trigger('click')
      await wait()
      expect(modal().text()).toContain('Are you sure you want to delete this document')

      const confirmButton = modal().findAll('button').find(b => b.text() === 'Delete')
      await confirmButton?.trigger('click')
      await wait()

      expect(mockDelete).toHaveBeenCalledWith({ collectionName: 'customers', documentId: 'doc-1' })
    })
  })

  describe('bulk delete', () => {
    const rows = [
      { _id: { $oid: 'doc-1' }, name: 'Alice' },
      { _id: { $oid: 'doc-2' }, name: 'Bob' },
      { _id: { $oid: 'doc-3' }, name: 'Carol' },
    ]

    async function mountAndSelectFirstTwo() {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows, '3'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()
      const boxes = component.findAll('[aria-label="Select row"]')
      await boxes[0]!.trigger('click')
      await boxes[1]!.trigger('click')
      return component
    }

    it('deletes exactly the selected documents by id after confirming, then reloads the page', async () => {
      const component = await mountAndSelectFirstTwo()
      expect(component.text()).toContain('2 selected')

      await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
      await wait()
      expect(mockDelete).not.toHaveBeenCalled()

      await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
      await wait()

      expect(mockDelete.mock.calls.map(c => c[0].documentId).sort()).toEqual(['doc-1', 'doc-2'])
      expect(mockDelete.mock.calls.every(c => c[0].collectionName === 'customers')).toBe(true)
      expect(mockListDocumentsRaw).toHaveBeenCalledTimes(2)
    })

    describe('with ids the server can address (24-hex)', () => {
      const hex = (n: number) => n.toString(16).padStart(24, '0')
      const hexRows = [
        { _id: hex(1), name: 'Alice' },
        { _id: hex(2), name: 'Bob' },
        { _id: hex(3), name: 'Carol' },
      ]

      // clearAllMocks keeps implementations, so the rejections set below must not leak into other tests
      afterEach(() => {
        mockDeleteMany.mockReset()
        mockDelete.mockReset()
      })

      async function selectFirstTwoAndConfirm() {
        mockListDocumentsRaw.mockResolvedValue(mockRawResponse(hexRows, '3'))
        const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
        await wait()
        const boxes = component.findAll('[aria-label="Select row"]')
        await boxes[0]!.trigger('click')
        await boxes[1]!.trigger('click')
        await component.findAll('button').find(b => b.text() === 'Delete selected')?.trigger('click')
        await wait()
        await modal().findAll('button').find(b => b.text() === 'Delete 2')?.trigger('click')
        await wait()
        return component
      }

      it('deletes the selection with one deleteMany over an $or of the ids, not one request per document', async () => {
        mockDeleteMany.mockResolvedValue({ wasAcknowledged: true, deletedCount: 2 })
        await selectFirstTwoAndConfirm()

        expect(mockDeleteMany).toHaveBeenCalledTimes(1)
        expect(mockDeleteMany).toHaveBeenCalledWith({ collectionName: 'customers', requestBody: { $or: [{ _id: hex(1) }, { _id: hex(2) }] } })
        expect(mockDelete).not.toHaveBeenCalled()
        expect(mockListDocumentsRaw).toHaveBeenCalledTimes(2)
      })

      it('re-deletes one by one when deleteMany reports fewer deletions than ids, instead of claiming success', async () => {
        mockDeleteMany.mockResolvedValue({ wasAcknowledged: true, deletedCount: 1 })
        await selectFirstTwoAndConfirm()

        expect(mockDelete.mock.calls.map(c => c[0].documentId).sort()).toEqual([hex(1), hex(2)])
      })

      it('falls back to single deletes when deleteMany fails, and reports what those could not delete', async () => {
        mockDeleteMany.mockRejectedValue(new Error('fast path down'))
        mockDelete.mockImplementation(async (p: { documentId: string }) => {
          if (p.documentId === hex(2)) throw new Error('forbidden')
        })
        await selectFirstTwoAndConfirm()

        expect(mockDelete).toHaveBeenCalledTimes(2)
        expect(modal().text()).toContain('1 of 2 could not be deleted: forbidden')
      })
    })

    it('drops the selection when another page is fetched, so off-screen rows can never be deleted', async () => {
      const component = await mountAndSelectFirstTwo()
      expect(component.text()).toContain('2 selected')

      await component.find('[aria-label="Reload"]').trigger('click')
      await wait()

      expect(component.text()).not.toContain('selected')
    })

    it('offers no selection on GridFS bucket collections, where documents are managed through the bucket', async () => {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse([{ _id: { $oid: 'file-1' }, filename: 'a.png' }], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'images.files' },
      })
      await wait()

      expect(component.text()).toContain('a.png')
      expect(component.find('[aria-label="Select row"]').exists()).toBe(false)
    })
  })

  describe('filter builder', () => {
    const rows = [
      { _id: { $oid: 'doc-1' }, name: 'Alice', age: 30 },
      { _id: { $oid: 'doc-2' }, name: 'Bob', age: 25 },
    ]

    async function mountWithRows() {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows, '2'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()
      return component
    }

    async function applyNameContains(component: Awaited<ReturnType<typeof mountWithRows>>, value: string, negate = false) {
      await component.find('[aria-label="Filters"]').trigger('click')
      await wait()
      await component.findAll('button').find(b => b.text() === 'Add condition')?.trigger('click')
      await wait()
      // the new row starts on the first field ("age", a number — `_id` is not offered); point it at "name" with "contains"
      const selectByLabel = (label: string) => component.findAllComponents(USelect).find(select => select.html().includes(`aria-label="${label}"`))!
      selectByLabel('Field').vm.$emit('update:modelValue', 'name')
      await wait()
      selectByLabel('Operator').vm.$emit('update:modelValue', 'contains')
      await wait()
      await component.find('input[aria-label="Value"]').setValue(value)
      if (negate) {
        await component.find('[role="checkbox"]').trigger('click')
        await wait()
      }
      await component.findAll('button').find(b => b.text() === 'Apply filters')?.trigger('click')
      await wait()
    }

    describe('value suggestions', () => {
      const distinctResponse = (values: unknown[], total = values.length) => ({
        raw: { headers: { get: (name: string) => (name === 'x-pagination-count-rows' ? String(total) : null) } },
        value: () => Promise.resolve(values),
      })

      // opens the panel and makes a "name equals" condition, leaving the value input ready to focus
      async function openNameEquals(component: Awaited<ReturnType<typeof mountWithRows>>) {
        await component.find('[aria-label="Filters"]').trigger('click')
        await wait()
        await component.findAll('button').find(b => b.text() === 'Add condition')?.trigger('click')
        await wait()
        const selectByLabel = (label: string) => component.findAllComponents(USelect).find(select => select.html().includes(`aria-label="${label}"`))!
        selectByLabel('Field').vm.$emit('update:modelValue', 'name')
        await wait()
        selectByLabel('Operator').vm.$emit('update:modelValue', 'equals')
        await wait()
        return component.find('input[aria-label="Value"]')
      }

      const optionLabels = (component: Awaited<ReturnType<typeof mountWithRows>>) => component.findAll('datalist option').map(o => o.attributes('label'))

      afterEach(() => {
        mockDistinctRaw.mockReset()
      })

      it('suggests the field\'s distinct values, sorted, when the value input of an exact-match condition is focused', async () => {
        mockDistinctRaw.mockResolvedValue(distinctResponse(['Carol', 'alice', 'Bob', 'Bob']))
        const component = await mountWithRows()
        const input = await openNameEquals(component)
        expect(mockDistinctRaw).not.toHaveBeenCalled()

        await input.trigger('focus')
        await wait()

        expect(mockDistinctRaw).toHaveBeenCalledWith({ collectionName: 'customers', field: 'name', rowsPerPage: 100, page: 1 }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
        expect(optionLabels(component)).toEqual(['alice', 'Bob', 'Carol'])
      })

      it('asks the server once per field, not on every focus', async () => {
        mockDistinctRaw.mockResolvedValue(distinctResponse(['Alice', 'Bob']))
        const component = await mountWithRows()
        const input = await openNameEquals(component)

        await input.trigger('focus')
        await wait()
        await input.trigger('focus')
        await wait()

        expect(mockDistinctRaw).toHaveBeenCalledTimes(1)
      })

      it('asks again after the table is reloaded', async () => {
        mockDistinctRaw.mockResolvedValue(distinctResponse(['Alice']))
        const component = await mountWithRows()
        const input = await openNameEquals(component)
        await input.trigger('focus')
        await wait()
        expect(mockDistinctRaw).toHaveBeenCalledTimes(1)

        await component.find('[aria-label="Reload"]').trigger('click')
        await wait()
        const again = await openNameEquals(component)
        await again.trigger('focus')
        await wait()

        expect(mockDistinctRaw).toHaveBeenCalledTimes(2)
      })

      it('offers nothing for a field with more distinct values than fit in one page — an arbitrary hundred would mislead', async () => {
        mockDistinctRaw.mockResolvedValue(distinctResponse(Array.from({ length: 100 }, (_, i) => `name${i}`), 1000))
        const component = await mountWithRows()
        const input = await openNameEquals(component)

        await input.trigger('focus')
        await wait()

        expect(optionLabels(component)).toEqual([])
      })

      it('keeps working as a plain input when the lookup fails, and does not hammer a failing server', async () => {
        mockDistinctRaw.mockRejectedValue(new Error('server down'))
        const component = await mountWithRows()
        const input = await openNameEquals(component)

        await input.trigger('focus')
        await wait()
        await input.trigger('focus')
        await wait()

        expect(optionLabels(component)).toEqual([])
        expect(component.text()).not.toContain('server down')
        expect(mockDistinctRaw).toHaveBeenCalledTimes(1)
        await input.setValue('Alice')
        expect((input.element as HTMLInputElement).value).toBe('Alice')
      })
    })

    it('is unavailable until the collection has rows to learn the fields from', async () => {
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()

      expect(component.find('[aria-label="Filters"]').attributes('disabled')).toBeDefined()
    })

    it('offers _id (exact operators only) but not fields without operators (arrays, objects) in the field list', async () => {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse([
        { _id: { $oid: 'doc-1' }, name: 'Alice', age: 30, tags: ['a'], address: { city: 'X' } },
      ], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()
      await component.find('[aria-label="Filters"]').trigger('click')
      await wait()
      await component.findAll('button').find(b => b.text() === 'Add condition')?.trigger('click')
      await wait()

      const fieldSelect = component.findAllComponents(USelect).find(select => select.html().includes('aria-label="Field"'))!
      const offered = (fieldSelect.vm.$props as unknown as { items: { value: string }[] }).items.map(item => item.value)
      expect(offered).toEqual(['_id', 'age', 'name'])
    })

    it('never offers _id as a bulk-edit target, even though the filter builder knows it', async () => {
      const component = await mountWithRows()
      await wait()
      const fields = (component.findComponent({ name: 'MongocampBulkEdit' }).props() as { fields: { key: string }[] }).fields
      expect(fields.map(f => f.key)).not.toContain('_id')
    })

    it('applies the built filter from page 1 and shows it as a removable chip', async () => {
      const component = await mountWithRows()
      await applyNameContains(component, 'ali')

      const lastCall = mockListDocumentsRaw.mock.calls.at(-1)![0]
      expect(lastCall.filter).toBe('name:*ali*')
      expect(lastCall.page).toBe(1)
      expect(component.text()).toContain('name contains ali')
    })

    it('an excluded filter is sent negated, marked above the table, and combined with the quick search', async () => {
      const component = await mountWithRows()
      await applyNameContains(component, 'ali', true)

      expect(mockListDocumentsRaw.mock.calls.at(-1)![0].filter).toBe('-name:*ali*')
      expect(component.text()).toContain('Excluding documents that match')
      expect(component.text()).toContain('name contains ali')

      await component.find('input[placeholder="Filter rows..."]').setValue('bo')
      await wait(400) // the quick filter is debounced

      expect(mockListDocumentsRaw.mock.calls.at(-1)![0].filter).toBe('(name:*bo* AND (-name:*ali*))')
    })

    it('combines the builder filter with the quick search using AND', async () => {
      const component = await mountWithRows()
      await applyNameContains(component, 'ali')

      await component.find('input[placeholder="Filter rows..."]').setValue('bo')
      await wait(400) // the quick filter is debounced

      expect(mockListDocumentsRaw.mock.calls.at(-1)![0].filter).toBe('(name:*bo* AND name:*ali*)')
    })

    it('removing a chip drops that filter and reloads', async () => {
      const component = await mountWithRows()
      await applyNameContains(component, 'ali')

      await component.find('[aria-label="Remove filter name contains ali"]').trigger('click')
      await wait()

      expect(mockListDocumentsRaw.mock.calls.at(-1)![0].filter).toBeUndefined()
      expect(component.text()).not.toContain('name contains ali')
    })

    describe('when the server rejects the request', () => {
      const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })

      // the server answers a filtered request with a plain 400 — what a rejected filter looks like
      function rejectFilteredRequests() {
        mockListDocumentsRaw.mockImplementation(async (args: { filter?: string }) => {
          if (args.filter) throw { name: 'ResponseError', response: { status: 400 } }
          return mockRawResponse(rows, '2')
        })
      }

      function clearButtons(component: Awaited<ReturnType<typeof mountWithRows>>) {
        return component.findAll('button').filter(b => b.text() === 'Clear filters')
      }

      it('recognises a rejected filter by the 400, without a second request', async () => {
        const component = await mountWithRows()
        rejectFilteredRequests()
        const callsBefore = mockListDocumentsRaw.mock.calls.length
        await applyNameContains(component, 'ali')

        expect(component.text()).toContain('The filter could not be applied')
        expect(component.text()).not.toContain('could not be reached')
        expect(mockListDocumentsRaw.mock.calls.length - callsBefore).toBe(1)
      })

      it('keeps the generic message for a network failure, even with a filter', async () => {
        const component = await mountWithRows()
        mockListDocumentsRaw.mockImplementation(async () => {
          throw fetchError
        })
        await applyNameContains(component, 'ali')

        expect(component.text()).toContain('could not be reached')
        expect(component.text()).not.toContain('The filter could not be applied')
      })

      it('does not blame the filter when the session has expired (401)', async () => {
        const component = await mountWithRows()
        mockListDocumentsRaw.mockImplementation(async (args: { filter?: string }) => {
          if (args.filter) throw { name: 'ResponseError', response: { status: 401 } }
          return mockRawResponse(rows, '2')
        })
        await applyNameContains(component, 'ali')

        expect(component.text()).toContain('session has expired')
        expect(component.text()).not.toContain('The filter could not be applied')
      })

      it('does not blame a filter when none was in use', async () => {
        mockListDocumentsRaw.mockImplementation(async () => {
          throw fetchError
        })
        const component = await mountSuspended(withUApp(MongocampCollectionData), {
          route: '/',
          props: { collectionName: 'customers' },
        })
        await wait()

        expect(component.text()).toContain('could not be reached')
        expect(mockListDocumentsRaw).toHaveBeenCalledTimes(1)
      })

      it('"Clear filters" in the alert drops the search and every condition and reloads from page 1', async () => {
        const component = await mountWithRows()
        rejectFilteredRequests()
        await applyNameContains(component, 'ali')
        expect(component.text()).toContain('The filter could not be applied')

        await clearButtons(component).at(-1)!.trigger('click')
        await wait()

        expect(component.text()).not.toContain('The filter could not be applied')
        expect(component.text()).not.toContain('name contains ali')
        const reload = mockListDocumentsRaw.mock.calls.at(-1)![0]
        expect(reload.page).toBe(1)
        expect(reload.filter).toBeUndefined()
        expect(reload.rowsPerPage).toBe(20)
      })
    })

    it('forgets the filters, and closes the panel, when the collection changes', async () => {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows, '2'))
      // a host that owns the collectionName prop, so it can be changed after mount like a router param would
      const collectionName = ref('customers')
      const Host = defineComponent({
        setup: () => () => h(UApp, () => h(MongocampCollectionData, { collectionName: collectionName.value })),
      })
      const component = await mountSuspended(Host, { route: '/' })
      await wait()
      await applyNameContains(component as never, 'ali')
      expect(component.text()).toContain('name contains ali')

      collectionName.value = 'orders'
      await wait()

      expect(component.text()).not.toContain('name contains ali')
      expect(component.text()).not.toContain('Apply filters')
      expect(mockListDocumentsRaw.mock.calls.at(-1)![0]).toMatchObject({ collectionName: 'orders', filter: undefined })
    })
  })

  describe('bulk edit', () => {
    const hex = (n: number) => n.toString(16).padStart(24, '0')
    const rows = [
      { _id: hex(1), name: 'Alice', age: 30, metaData: { createdBy: 'x' } },
      { _id: hex(2), name: 'Bob', age: 25, metaData: { createdBy: 'x' } },
      { _id: hex(3), name: 'Carol', age: 41, metaData: { createdBy: 'x' } },
    ]

    async function mountAndSelectFirstTwo(data: Record<string, unknown>[] = rows) {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(data, String(data.length)))
      mockUpdateMany.mockImplementation(async (p: { updateRequest: { filter: { $or: unknown[] } } }) => ({ matchedCount: p.updateRequest.filter.$or.length, modifiedCount: p.updateRequest.filter.$or.length }))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName: 'customers' } })
      await wait()
      const boxes = component.findAll('[aria-label="Select row"]')
      await boxes[0]!.trigger('click')
      await boxes[1]!.trigger('click')
      await component.findAll('button').find(b => b.text() === 'Edit selected')?.trigger('click')
      await wait()
      return component
    }

    const selectByLabel = (component: Awaited<ReturnType<typeof mountAndSelectFirstTwo>>, label: string) =>
      component.findAllComponents(USelect).find(select => select.html().includes(`aria-label="${label}"`))!

    it('offers only scalar fields of the rows — never _id or the metaData object', async () => {
      const component = await mountAndSelectFirstTwo()

      const offered = (selectByLabel(component, 'Field').vm.$props as unknown as { items: { value: string }[] }).items.map(i => i.value)
      expect(offered).toEqual(['age', 'name'])
    })

    it('updates the selected documents with one updateMany over an $or of their ids, then reloads', async () => {
      const component = await mountAndSelectFirstTwo()

      selectByLabel(component, 'Field').vm.$emit('update:modelValue', 'age')
      await wait()
      await modal().find('input[aria-label="Value"]').setValue('31')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Update 2')?.trigger('click')
      await wait()

      expect(mockUpdateMany).toHaveBeenCalledTimes(1)
      expect(mockUpdateMany).toHaveBeenCalledWith({
        collectionName: 'customers',
        updateRequest: { filter: { $or: [{ _id: hex(1) }, { _id: hex(2) }] }, document: { age: 31 } },
      })
      expect(mockListDocumentsRaw).toHaveBeenCalledTimes(2)
    })

    it('blocks an invalid value instead of sending it', async () => {
      const component = await mountAndSelectFirstTwo()

      selectByLabel(component, 'Field').vm.$emit('update:modelValue', 'age')
      await wait()
      await modal().find('input[aria-label="Value"]').setValue('abc')
      await wait()

      expect(modal().text()).toContain('Not a valid number')
      expect(modal().findAll('button').find(b => b.text() === 'Update 2')?.attributes('disabled')).toBeDefined()
      expect(mockUpdateMany).not.toHaveBeenCalled()
    })

    it('refuses ids the server cannot address, without a request, and keeps those rows selected', async () => {
      const component = await mountAndSelectFirstTwo([
        { _id: { $oid: 'doc-1' }, name: 'Alice', age: 30 },
        { _id: { $oid: 'doc-2' }, name: 'Bob', age: 25 },
      ])

      selectByLabel(component, 'Field').vm.$emit('update:modelValue', 'name')
      await wait()
      await modal().find('input[aria-label="Value"]').setValue('Zed')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Update 2')?.trigger('click')
      await wait()

      expect(mockUpdateMany).not.toHaveBeenCalled()
      expect(modal().text()).toContain('2 of 2 could not be updated: this document id cannot be updated in bulk')
      expect(component.text()).toContain('2 selected')
    })

    it('keeps the dialog open and the rows selected when the update fails, and says so', async () => {
      const component = await mountAndSelectFirstTwo()
      mockUpdateMany.mockRejectedValueOnce(new Error('server said no'))

      selectByLabel(component, 'Field').vm.$emit('update:modelValue', 'age')
      await wait()
      await modal().find('input[aria-label="Value"]').setValue('31')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Update 2')?.trigger('click')
      await wait()

      expect(modal().text()).toContain('2 of 2 could not be updated: server said no')
      expect(component.text()).toContain('2 selected')
    })

    it('does not call fewer matches a success', async () => {
      const component = await mountAndSelectFirstTwo()
      mockUpdateMany.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })

      selectByLabel(component, 'Field').vm.$emit('update:modelValue', 'age')
      await wait()
      await modal().find('input[aria-label="Value"]').setValue('31')
      await wait()
      await modal().findAll('button').find(b => b.text() === 'Update 2')?.trigger('click')
      await wait()

      expect(modal().text()).toContain('only 1 of 2 selected documents were found')
    })
  })

  describe('GridFS bucket collections', () => {
    it('shows an upload button instead of insert, and a download button per row', async () => {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: { $oid: 'file-1' }, filename: 'a.png' }], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'images.files' },
      })
      await wait()

      expect(component.find('[aria-label="Insert document"]').exists()).toBe(false)
      expect(component.find('[aria-label="Upload file"]').exists()).toBe(true)
      expect(component.find('[aria-label="Download file"]').exists()).toBe(true)
    })

    it('offers no document import (a file\'s chunks must never be imported as plain documents)', async () => {
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'images.files' },
      })
      await wait()

      expect(component.find('[aria-label="Import documents"]').exists()).toBe(false)
    })

    it('downloading a row triggers fileApi against the bucket name derived from the collection', async () => {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([{ _id: { $oid: 'file-1' }, filename: 'a.png' }], '1'))
      mockGetFileInformation.mockResolvedValueOnce({ filename: 'a.png' })
      mockGetFile.mockResolvedValueOnce(new Blob(['data']))

      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'images.files' },
      })
      await wait()

      await component.find('[aria-label="Download file"]').trigger('click')
      await wait()

      expect(mockGetFileInformation).toHaveBeenCalledWith({ bucketName: 'images', fileId: 'file-1' })
    })
  })

  describe('index this field', () => {
    const rows = [{ _id: 'doc-1', email: 'a@x.de', age: 3, metaData: { created: '2024-01-01T00:00:00.000Z' } }]

    async function mountData(collectionName = 'customers') {
      mockListDocumentsRaw.mockResolvedValue(mockRawResponse(rows, '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), { route: '/', props: { collectionName } })
      await wait()
      return component
    }

    const indexButtons = (component: Awaited<ReturnType<typeof mountData>>) => component.findAll('button').filter(b => (b.attributes('aria-label') ?? '').startsWith('Index '))

    async function choose(component: Awaited<ReturnType<typeof mountData>>, field: string, item: string) {
      const trigger = component.find(`button[aria-label="Index ${field}"]`)
      await trigger.trigger('keydown', { key: 'Enter' })
      await wait()
      await modal().findAll('[role="menuitem"]').find(i => i.text() === item)!.trigger('click')
      await wait()
    }

    it('offers nothing to someone who is not a manager', async () => {
      const component = await mountData()

      expect(indexButtons(component)).toHaveLength(0)
    })

    it('offers it for data fields to a manager, but not for _id or metaData', async () => {
      session.isAdmin = true
      const component = await mountData()

      expect(indexButtons(component).map(b => b.attributes('aria-label')).sort()).toEqual(['Index age', 'Index email'])
    })

    it('offers nothing on a GridFS bucket collection', async () => {
      session.isAdmin = true
      const component = await mountData('images.files')

      expect(indexButtons(component)).toHaveLength(0)
    })

    it('creates an ascending index for the field and reports it with a link to the index panel', async () => {
      session.isAdmin = true
      mockCreateIndexForField.mockResolvedValueOnce({ name: 'email_1' })
      const component = await mountData()

      await choose(component, 'email', 'Create ascending index')

      expect(mockCreateIndexForField).toHaveBeenCalledWith({ collectionName: 'customers', fieldName: 'email', sortAscending: true }, { signal: expect.any(AbortSignal) })
      expect(document.body.textContent).toContain('Index email_1 on customers was created.')
      expect(document.body.querySelector('a[href="/secured/admin/collections/customers"]')).not.toBeNull()
    })

    it('creates a descending index when asked', async () => {
      session.isAdmin = true
      mockCreateIndexForField.mockResolvedValueOnce({ name: 'age_-1' })
      const component = await mountData()

      await choose(component, 'age', 'Create descending index')

      expect(mockCreateIndexForField).toHaveBeenCalledWith({ collectionName: 'customers', fieldName: 'age', sortAscending: false }, { signal: expect.any(AbortSignal) })
    })

    it('shows the server\'s refusal without its database address', async () => {
      session.isAdmin = true
      const body = { code: -1, msg: 'Command failed with error 85 (IndexOptionsConflict): \'Index already exists with a different name\' on server 10.1.2.3:27017. The full response is {}' }
      mockCreateIndexForField.mockRejectedValueOnce(Object.assign(new Error('x'), { response: new Response(JSON.stringify(body), { status: 500 }) }))
      const component = await mountData()
      const createdBefore = document.body.textContent!.match(/was created/g)?.length ?? 0

      await choose(component, 'email', 'Create ascending index')

      expect(document.body.textContent!.match(/was created/g)?.length ?? 0).toBe(createdBefore)
      expect(document.body.textContent).toContain('Could not index email')
      expect(document.body.textContent).toContain('Index already exists with a different name')
      expect(document.body.textContent).not.toContain('10.1.2.3')
    })
  })
})
