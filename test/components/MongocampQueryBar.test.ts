import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { UApp } from '#components'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampQueryBar from '../../src/runtime/components/MongocampQueryBar.vue'
import { emptyQueryState } from '../../src/runtime/utils/queryState'
import type { QueryState } from '../../src/runtime/utils/queryState'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const body = () => new DOMWrapper(document.body)
const fields = [{ key: 'name', type: 'string' as const }, { key: 'age', type: 'number' as const }]
const columns = ['_id', 'name', 'age', 'city']

beforeEach(() => localStorage.clear())

// a host that owns the applied query like a parent list does, and records every `apply`
async function mountBar(initial: Partial<QueryState> = {}, collection = 'orders') {
  const applied: QueryState[] = []
  const model = ref<QueryState>({ ...emptyQueryState(), ...initial })
  const Host = defineComponent({
    setup: () => () => h(UApp, () => h(MongocampQueryBar, {
      'modelValue': model.value,
      'onUpdate:modelValue': (v: QueryState) => (model.value = v),
      'onApply': (v: QueryState) => applied.push(v),
      fields,
      columns,
      collection,
    })),
  })
  const component = await mountSuspended(Host, { route: '/' })
  await flushPromises()
  return { component, applied, model }
}

const byLabel = (scope: { findAll: (s: string) => Array<{ attributes: (n: string) => string | undefined, trigger: (e: string) => Promise<void> }> }, label: string) =>
  scope.findAll('button').find(b => b.attributes('aria-label') === label)

describe('MongocampQueryBar', () => {
  describe('sort', () => {
    it('adds a sort on the first free field, flips its direction and removes it — each change is applied', async () => {
      const { component, applied, model } = await mountBar()
      await byLabel(component, 'Sort')!.trigger('click')
      await wait()
      await body().findAll('button').find(b => b.text() === 'Add sort')!.trigger('click')
      expect(model.value.sort).toEqual(['_id'])
      expect(applied.at(-1)!.sort).toEqual(['_id'])

      await byLabel(body(), 'Change direction of _id')!.trigger('click')
      expect(model.value.sort).toEqual(['-_id'])

      await byLabel(body(), 'Remove sort on _id')!.trigger('click')
      expect(model.value.sort).toEqual([])
      expect(applied).toHaveLength(3)
    })

    it('shows how many sorts are set', async () => {
      const { component } = await mountBar({ sort: ['-age', 'name'] })
      expect(component.text()).toContain('2')
    })
  })

  describe('filter chips', () => {
    const group = { match: 'all' as const, conditions: [{ id: 'c1', field: 'name', operator: 'equals' as const, value: 'Alice' }, { id: 'c2', field: 'age', operator: 'gte' as const, value: '18' }] }

    it('shows one chip per condition, removes one with a rebuilt query and clears all', async () => {
      const { component, applied, model } = await mountBar({ filterGroup: group, lucene: 'name:"Alice" AND age:[18 TO 9999999999999]' })
      expect(component.text()).toContain('name')
      const remove = component.findAll('button').find(b => b.attributes('aria-label')?.startsWith('Remove filter name'))!
      await remove.trigger('click')
      expect(model.value.filterGroup.conditions.map(c => c.id)).toEqual(['c2'])
      expect(model.value.lucene).not.toContain('Alice')
      expect(applied).toHaveLength(1)

      await component.findAll('button').find(b => b.text() === 'Clear filters')!.trigger('click')
      expect(model.value.filterGroup.conditions).toEqual([])
      expect(model.value.lucene).toBe('')
    })

    it('shows the string of a query restored without conditions as a chip that can be removed', async () => {
      const { component, model } = await mountBar({ lucene: 'status:open' })
      expect(component.text()).toContain('Filter text: status:open')
      await component.findAll('button').find(b => b.attributes('aria-label')?.startsWith('Remove filter'))!.trigger('click')
      expect(model.value.lucene).toBe('')
    })
  })

  describe('fields to load', () => {
    it('says how many fields are loaded and loads all of them again on request', async () => {
      const { component, model, applied } = await mountBar({ projection: ['name', 'age'] })
      expect(component.text()).toContain('2 of 3 fields are loaded')
      await component.findAll('button').find(b => b.text() === 'Load all fields')!.trigger('click')
      expect(model.value.projection).toEqual([])
      expect(applied).toHaveLength(1)
    })

    it('names no fields note when everything is loaded, and ignores fields the collection lacks', async () => {
      const { component } = await mountBar({ projection: ['ghost'] })
      expect(component.text()).not.toContain('fields are loaded')
    })
  })

  describe('history and saved queries', () => {
    async function openHistory(component: Awaited<ReturnType<typeof mountBar>>['component']) {
      await byLabel(component, 'History and saved queries')!.trigger('click')
      await wait()
    }

    it('remembers an applied query and restores it from the recent list', async () => {
      const { component, applied, model } = await mountBar()
      await byLabel(component, 'Sort')!.trigger('click')
      await wait()
      await body().findAll('button').find(b => b.text() === 'Add sort')!.trigger('click')
      model.value = emptyQueryState() // the parent moved on
      await flushPromises()

      await openHistory(component)
      const recent = body().findAll('[data-test="recent-query"]')
      expect(recent).toHaveLength(1)
      expect(recent[0]!.text()).toContain('Sort: _id')
      applied.length = 0
      await recent[0]!.trigger('click')
      expect(model.value.sort).toEqual(['_id'])
      expect(applied).toHaveLength(1)
    })

    it('does not put an empty query in the history', async () => {
      const { component } = await mountBar()
      await openHistory(component)
      expect(body().findAll('[data-test="recent-query"]')).toHaveLength(0)
      expect(body().text()).toContain('Nothing yet')
    })

    it('saves the current query under a name, restores it and deletes it', async () => {
      const { component, model } = await mountBar({ sort: ['-age'], projection: ['name', 'age'] })
      await openHistory(component)
      const input = body().find('input[aria-label="Name"]')
      await input.setValue('Oldest first')
      await body().findAll('button').find(b => b.text() === 'Save')!.trigger('click')
      await flushPromises()
      expect(body().text()).toContain('Oldest first')

      model.value = emptyQueryState()
      await flushPromises()
      const saved = body().findAll('button').find(b => b.text().includes('Oldest first'))!
      await saved.trigger('click')
      expect(model.value.sort).toEqual(['-age'])
      expect(model.value.projection).toEqual(['name', 'age'])

      await byLabel(body(), 'Delete saved query Oldest first')!.trigger('click')
      expect(body().text()).not.toContain('Oldest first')
    })

    it('cannot save an empty query', async () => {
      const { component } = await mountBar()
      await openHistory(component)
      await body().find('input[aria-label="Name"]').setValue('x')
      expect(body().findAll('button').find(b => b.text() === 'Save')!.attributes('disabled')).toBeDefined()
    })

    it('keeps the history of each collection apart', async () => {
      const a = await mountBar({ sort: ['name'] }, 'orders')
      await byLabel(a.component, 'Sort')!.trigger('click')
      await wait()
      await body().findAll('button').find(b => b.text() === 'Add sort')!.trigger('click')
      a.component.unmount()

      const b = await mountBar({}, 'users')
      await openHistory(b.component)
      expect(body().findAll('[data-test="recent-query"]')).toHaveLength(0)
    })

    it('drops fields a restored query names that this collection lacks', async () => {
      localStorage.setItem('nuxt-ui-mongocamp:savedQueries:orders', JSON.stringify({ v: 1, data: { saved: [{ name: 'Old', query: { projection: ['name', 'gone'], sort: ['-age'] } }], recent: [] } }))
      const { component, model } = await mountBar()
      await openHistory(component)
      await body().findAll('button').find(b => b.text().includes('Old'))!.trigger('click')
      expect(model.value.projection).toEqual(['name'])
      expect(model.value.sort).toEqual(['-age'])
    })
  })
})
