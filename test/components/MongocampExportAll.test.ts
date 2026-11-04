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

const result = (patch: Record<string, unknown> = {}) => ({ content: '[]', filename: 'orders-20261104-1000.json', mimeType: 'application/json', format: 'json', rowCount: 3, total: 3, truncated: false, totalChanged: false, ...patch })

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
    expect(mockExport.mock.calls[0]![0]).toMatchObject({ collection: 'orders', format: 'csv', filter: 'status:open', sort: ['-age'], projection: ['name'], signal: expect.any(AbortSignal) })
    expect(modal().find('[data-test="export-result"]').text()).toContain('Exported 3 documents to orders-20261104-1000.json.')
  })

  it('sends no empty sort or projection', async () => {
    await mountExport({ sort: [], projection: [] })
    await button('Export').trigger('click')
    await wait()
    expect(mockExport.mock.calls[0]![0].sort).toBeUndefined()
    expect(mockExport.mock.calls[0]![0].projection).toBeUndefined()
  })

  it('says the file is incomplete when the cap cut it off', async () => {
    mockExport.mockResolvedValue(result({ rowCount: 50_000, total: 70_000, truncated: true }))
    await mountExport()
    await button('Export').trigger('click')
    await wait()
    const text = modal().find('[data-test="export-result"]').text()
    expect(text).toContain('The file is incomplete: only the first 50000 of 70000 documents were exported')
  })

  it('warns when the collection changed while it was read', async () => {
    mockExport.mockResolvedValue(result({ totalChanged: true }))
    await mountExport()
    await button('Export').trigger('click')
    await wait()
    expect(modal().text()).toContain('may miss or repeat one')
  })

  it('shows progress and can be cancelled — then nothing is downloaded', async () => {
    mockExport.mockImplementation(async (options: { signal: AbortSignal, onProgress: (p: { loaded: number, target: number }) => void }) => {
      options.onProgress({ loaded: 500, target: 2000 })
      await new Promise<void>((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    })
    await mountExport({ total: 2000 })
    await button('Export').trigger('click')
    await wait()
    expect(modal().find('[data-test="export-progress"]').text()).toContain('Reading 500 of 2000')

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
