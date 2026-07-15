import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
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
const mockDelete = vi.fn()
const mockGetFileInformation = vi.fn()
const mockGetFile = vi.fn()
const mockInsertFile = vi.fn()

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
      _delete: mockDelete,
    },
    fileApi: {
      getFileInformation: mockGetFileInformation,
      getFile: mockGetFile,
      insertFile: mockInsertFile,
    },
    bucketApi: {},
  })
})

beforeEach(() => {
  vi.clearAllMocks()
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
})
