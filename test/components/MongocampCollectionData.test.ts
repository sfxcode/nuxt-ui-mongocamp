import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import MongocampCollectionData from '../../src/runtime/components/MongocampCollectionData.vue'

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

const mockListDocumentsRaw = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockDistinctRaw = vi.fn()
const mockDeleteMany = vi.fn()
const mockDelete = vi.fn()
const mockGetFileInformation = vi.fn()
const mockGetFile = vi.fn()
const mockInsertFile = vi.fn()
const mockCreateIndexForField = vi.fn()
const session = { isAdmin: false }

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
      insert: mockInsert,
      update: mockUpdate,
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
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'alice@example.com', isAdmin: session.isAdmin, roles: [] } } }))

beforeEach(() => {
  vi.clearAllMocks()
  session.isAdmin = false
  mockListDocumentsRaw.mockResolvedValue(mockRawResponse([], '0'))
})

describe('MongocampCollectionData', () => {
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
    })
  })

  describe('edit', () => {
    it('pre-fills the form from the row, strips _id, and preserves fields the form never touched', async () => {
      mockListDocumentsRaw.mockResolvedValueOnce(mockRawResponse([
        { _id: { $oid: 'doc-1' }, name: 'Alice', age: 30, legacyFlag: true },
      ], '1'))
      const component = await mountSuspended(withUApp(MongocampCollectionData), {
        route: '/',
        props: { collectionName: 'customers' },
      })
      await wait()

      await component.find('[aria-label="Edit document"]').trigger('click')
      await wait()

      expect((findInputByLabel(modal(), 'Name').element as HTMLInputElement).value).toBe('Alice')

      await findInputByLabel(modal(), 'Name').setValue('Alice Updated')
      await wait()
      await modal().find('button[type="submit"]').trigger('click')
      await wait()

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      const { documentId, requestBody } = mockUpdate.mock.calls[0]![0]
      expect(documentId).toBe('doc-1')
      expect(requestBody._id).toBeUndefined()
      expect(requestBody.name).toBe('Alice Updated')
      // full-replace safety (brain/patterns/document-crud.md): a field the sampled schema
      // still saw (legacyFlag is present on the only loaded row) survives untouched
      expect(requestBody.legacyFlag).toBe(true)
      expect(requestBody.metaData.updatedBy).toBeDefined()
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

    async function applyNameContains(component: Awaited<ReturnType<typeof mountWithRows>>, value: string) {
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

    it('does not offer _id or fields without operators (arrays, objects) in the field list', async () => {
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
      expect(offered).toEqual(['age', 'name'])
    })

    it('applies the built filter from page 1 and shows it as a removable chip', async () => {
      const component = await mountWithRows()
      await applyNameContains(component, 'ali')

      const lastCall = mockListDocumentsRaw.mock.calls.at(-1)![0]
      expect(lastCall.filter).toBe('name:*ali*')
      expect(lastCall.page).toBe(1)
      expect(component.text()).toContain('name contains ali')
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

      // the filtered request fails, the same request without a filter works — what a rejected filter looks like
      function rejectFilteredRequests() {
        mockListDocumentsRaw.mockImplementation(async (args: { filter?: string }) => {
          if (args.filter) throw fetchError
          return mockRawResponse(rows, '2')
        })
      }

      function clearButtons(component: Awaited<ReturnType<typeof mountWithRows>>) {
        return component.findAll('button').filter(b => b.text() === 'Clear filters')
      }

      it('tells a rejected filter apart from a dead server by retrying once without it', async () => {
        const component = await mountWithRows()
        rejectFilteredRequests()
        await applyNameContains(component, 'ali')

        expect(component.text()).toContain('The filter could not be applied')
        expect(component.text()).not.toContain('could not be reached')
        const probe = mockListDocumentsRaw.mock.calls.at(-1)![0]
        expect(probe.rowsPerPage).toBe(1) // a one-row probe, not a second full page load
        expect(probe.filter).toBeUndefined()
      })

      it('keeps the generic message when the collection does not load without the filter either', async () => {
        const component = await mountWithRows()
        mockListDocumentsRaw.mockImplementation(async () => {
          throw fetchError
        })
        await applyNameContains(component, 'ali')

        expect(component.text()).toContain('could not be reached')
        expect(component.text()).not.toContain('The filter could not be applied')
      })

      it('does not probe when the session has expired (401) — that is already clear', async () => {
        const component = await mountWithRows()
        mockListDocumentsRaw.mockImplementation(async (args: { filter?: string }) => {
          if (args.filter) throw { name: 'ResponseError', response: { status: 401 } }
          return mockRawResponse(rows, '2')
        })
        await applyNameContains(component, 'ali')

        expect(component.text()).toContain('session has expired')
        expect(component.text()).not.toContain('The filter could not be applied')
        expect(mockListDocumentsRaw.mock.calls.some(([args]) => args.rowsPerPage === 1)).toBe(false)
      })

      it('does not probe, and does not blame a filter, when none was in use', async () => {
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
        expect(reload.rowsPerPage).toBe(20) // a real reload, not the one-row probe
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
