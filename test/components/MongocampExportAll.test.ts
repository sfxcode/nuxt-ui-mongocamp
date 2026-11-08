import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { UApp, USelect } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampExportAll from '../../src/runtime/components/MongocampExportAll.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const modal = () => new DOMWrapper(document.body)

const mockExport = vi.hoisted(() => vi.fn())

// the composable has its own tests (useMongocampExportAll); here only what the dialog does with its result
vi.mock('../../src/runtime/composables/useMongocampExportAll', () => ({
  useMongocampExportAll: () => ({ exportCollection: mockExport }),
}))

const result = (patch: Record<string, unknown> = {}) => ({ blob: new Blob(['[]']), filename: 'orders-20261104-1000.json', mimeType: 'application/json', format: 'json', bytes: 2048, documents: 3, incomplete: false, ...patch })

beforeEach(() => {
  vi.resetAllMocks()
  mockExport.mockResolvedValue(result())
})

async function mountExport(props: Record<string, unknown> = {}) {
  const open = shallowRef(true)
  const Host = defineComponent({
    setup: () => () => h(UApp, () => h(MongocampExportAll, { 'collection': 'orders', 'open': open.value, 'onUpdate:open': (v: boolean) => (open.value = v), ...props })),
  })
  const component = await mountSuspended(Host, { route: '/' })
  await wait()
  return { component, open }
}

const button = (label: string) => modal().findAll('button').find(b => b.text() === label)!

describe('MongocampExportAll', () => {
  it('says what will be exported: everything, or what the filter matches, with the count', async () => {
    await mountExport({ total: 1200 })
    expect(modal().find('[data-test="export-scope"]').text()).toContain('All documents of orders')
    expect(modal().find('[data-test="export-scope"]').text()).toContain('1200 documents')
  })

  it('names the filter case and works without a count', async () => {
    await mountExport({ filter: 'status:open' })
    const scope = modal().find('[data-test="export-scope"]').text()
    expect(scope).toContain('that match the current filter')
    expect(scope).not.toContain('(')
  })

  it('exports with the list\'s filter, sort and fields in the chosen format and reports the file', async () => {
    const { component } = await mountExport({ filter: 'status:open', sort: ['-age'], projection: ['name'], total: 3 })
    component.findComponent(USelect).vm.$emit('update:modelValue', 'csv')
    await wait()
    await button('Export').trigger('click')
    await wait()

    expect(mockExport).toHaveBeenCalledTimes(1)
    expect(mockExport.mock.calls[0]![0]).toMatchObject({ collection: 'orders', format: 'csv', filter: 'status:open', sort: ['-age'], projection: ['name'], expected: 3, signal: expect.any(AbortSignal) })
    expect(modal().find('[data-test="export-result"]').text()).toContain('Exported 3 documents to orders-20261104-1000.json.')
  })

  it('sends no empty sort or projection', async () => {
    await mountExport({ sort: [], projection: [] })
    await button('Export').trigger('click')
    await wait()
    expect(mockExport.mock.calls[0]![0].sort).toBeUndefined()
    expect(mockExport.mock.calls[0]![0].projection).toBeUndefined()
  })

  it('has no cap and says the server streams the file', async () => {
    await mountExport({ total: 5_000_000 })
    expect(modal().text()).toContain('no limit on the number of documents')
    expect(modal().text()).not.toContain('At most')
  })

  it('says the file is incomplete when the server stopped before the end', async () => {
    mockExport.mockResolvedValue(result({ incomplete: true, documents: undefined }))
    await mountExport()
    await button('Export').trigger('click')
    await wait()
    const text = modal().find('[data-test="export-result"]').text()
    expect(text).toContain('The server stopped before the end, so orders-20261104-1000.json is incomplete')
    expect(text).not.toContain('Exported')
  })

  it('names the size when the number of documents is not known', async () => {
    mockExport.mockResolvedValue(result({ documents: undefined, bytes: 5 * 1024 * 1024 }))
    await mountExport()
    await button('Export').trigger('click')
    await wait()
    expect(modal().find('[data-test="export-result"]').text()).toContain('Exported orders-20261104-1000.json (5.0 MB).')
  })

  it('shows progress and can be cancelled — then nothing is downloaded', async () => {
    mockExport.mockImplementation(async (options: { signal: AbortSignal, onProgress: (p: { bytes: number, lines: number }) => void }) => {
      options.onProgress({ bytes: 3 * 1024 * 1024, lines: 5000 })
      await new Promise<void>((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    })
    await mountExport({ total: 2000 })
    await button('Export').trigger('click')
    await wait()
    expect(modal().find('[data-test="export-progress"]').text()).toContain('Receiving the file: 3.0 MB')

    await button('Cancel').trigger('click')
    await wait()
    expect(modal().find('[data-test="export-result"]').text()).toContain('Cancelled — nothing was downloaded.')
  })

  it('shows the message of a failure', async () => {
    mockExport.mockRejectedValue(new Error('boom'))
    await mountExport()
    await button('Export').trigger('click')
    await wait()
    expect(modal().find('[data-test="export-result"]').text()).toContain('boom')
  })

  it('starts from the form again when reopened', async () => {
    const { open } = await mountExport()
    await button('Export').trigger('click')
    await wait()
    open.value = false
    await wait()
    open.value = true
    await wait()
    expect(button('Export')).toBeDefined()
    expect(modal().find('[data-test="export-result"]').exists()).toBe(false)
  })
})
