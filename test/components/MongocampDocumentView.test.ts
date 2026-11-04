import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampDocumentView from '../../src/runtime/components/MongocampDocumentView.vue'

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => vi.restoreAllMocks())

const doc = {
  _id: { $oid: 'a'.repeat(24) },
  name: 'Alice',
  at: { $date: '2025-01-02T03:04:05.000Z' },
  big: { $numberLong: '9007199254740993' },
  address: { city: 'X', geo: { lat: 1 } },
  tags: ['a', 'b'],
}

async function mountView(props: Record<string, unknown> = {}) {
  const component = await mountSuspended(withUApp(MongocampDocumentView), { route: '/', props: { document: doc, ...props } })
  await flushPromises()
  return component
}

const row = (c: Awaited<ReturnType<typeof mountView>>, path: string) => c.find(`[data-path="${path}"]`)
const button = (scope: ReturnType<typeof row>, label: string) => scope.findAll('button').find(b => b.attributes('aria-label') === label)

describe('MongocampDocumentView', () => {
  it('shows the typed tree with ids, dates and exact longs as what they are', async () => {
    const c = await mountView()
    expect(row(c, '_id').text()).toContain('objectId')
    expect(row(c, '_id').text()).toContain('a'.repeat(24))
    expect(row(c, 'at').text()).toContain('date')
    expect(row(c, 'at').text()).toContain('2025-01-02T03:04:05.000Z')
    expect(row(c, 'big').text()).toContain('long')
    expect(row(c, 'big').text()).toContain('9007199254740993')
    expect(row(c, 'tags').text()).toContain('[2]')
  })

  it('opens the first two levels of a small document and collapses on request', async () => {
    const c = await mountView()
    expect(row(c, 'address.city').exists()).toBe(true)
    expect(row(c, 'address.geo.lat').exists()).toBe(false)

    await button(row(c, 'address'), 'Collapse')!.trigger('click')
    expect(row(c, 'address.city').exists()).toBe(false)
    await button(row(c, 'address'), 'Expand')!.trigger('click')
    await c.findAll('button').find(b => b.text() === 'Expand all')!.trigger('click')
    expect(row(c, 'address.geo.lat').exists()).toBe(true)
    await c.findAll('button').find(b => b.text() === 'Collapse all')!.trigger('click')
    expect(row(c, 'address.city').exists()).toBe(false)
  })

  // Expanding renders every row, the heaviest thing in this file; CI runs many workers at once, so it gets a generous
  // limit (it failed the 5 s default there while taking well under 1 s locally) and only as many rows as the rule needs.
  it('starts a large document collapsed, with a note', async () => {
    const big = { name: 'n', items: Array.from({ length: 210 }, (_, i) => i) } // 212 nodes: just above the 200 that collapse
    const c = await mountView({ document: big })
    expect(row(c, 'items').exists()).toBe(true)
    expect(row(c, 'items.0').exists()).toBe(false)
    expect(c.text()).toContain('Large document')
    await c.findAll('button').find(b => b.text() === 'Expand all')!.trigger('click')
    expect(row(c, 'items.0').exists()).toBe(true)
  }, 30_000)

  it('switches to JSON, written plainly with every digit of a long', async () => {
    const c = await mountView()
    await c.findAll('button').find(b => b.text() === 'JSON')!.trigger('click')
    const json = c.find('[data-test="document-json"]').text()
    expect(json).toContain(`"_id": "${'a'.repeat(24)}"`)
    expect(json).toContain('"big": 9007199254740993')
    expect(c.find('[data-test="document-tree"]').exists()).toBe(false)
  })

  it('honours mode as a prop', async () => {
    const c = await mountView({ mode: 'json' })
    expect(c.find('[data-test="document-json"]').exists()).toBe(true)
  })

  it('copies a path, a value (a long as every digit, a container as JSON) and the document, and emits copy', async () => {
    const c = await mountView()
    await button(row(c, 'address.city'), 'Copy path')!.trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('address.city')
    await button(row(c, 'big'), 'Copy value')!.trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('9007199254740993')
    await button(row(c, 'tags'), 'Copy value')!.trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('[\n  "a",\n  "b"\n]')
    await c.findAll('button').find(b => b.text() === 'Copy document')!.trigger('click')
    expect(writeText.mock.lastCall![0]).toContain('"big": 9007199254740993')

    const emitted = c.findComponent(MongocampDocumentView).emitted('copy')!.map(e => (e[0] as { kind: string }).kind)
    expect(emitted).toEqual(['path', 'value', 'value', 'document'])
  })

  it('still emits copy when the browser refuses the clipboard', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const c = await mountView()
    await button(row(c, 'name'), 'Copy value')!.trigger('click')
    await flushPromises()
    expect(c.findComponent(MongocampDocumentView).emitted('copy')).toHaveLength(1)
  })

  it('shows a message and disables copy without a document', async () => {
    const c = await mountView({ document: null })
    expect(c.text()).toContain('No document')
    expect(c.findAll('button').find(b => b.text() === 'Copy document')!.attributes('disabled')).toBeDefined()
  })

  it('shows the next document from the start, not the previous one’s open state', async () => {
    const current = shallowRef<Record<string, unknown>>(doc)
    const Host = defineComponent({
      setup: () => () => h(UApp, () => h(MongocampDocumentView, { document: current.value })),
    })
    const c = await mountSuspended(Host, { route: '/' })
    await flushPromises()
    await c.findAll('button').find(b => b.text() === 'Expand all')!.trigger('click')
    await c.findAll('button').find(b => b.text() === 'Collapse all')!.trigger('click')
    expect(row(c, 'address.city').exists()).toBe(false)

    current.value = { x: { y: { z: 1 } } }
    await flushPromises()
    expect(row(c, 'x').exists()).toBe(true)
    expect(row(c, 'x.y').exists()).toBe(true)
  })
})
