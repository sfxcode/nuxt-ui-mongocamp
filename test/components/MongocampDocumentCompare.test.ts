import { describe, it, expect, afterEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampDocumentCompare from '../../src/runtime/components/MongocampDocumentCompare.vue'

enableAutoUnmount(afterEach)

const left = { _id: 'a', name: 'Ann', age: 30, tag: 'x' }
const right = { _id: 'b', name: 'Ann', age: 31, city: 'Bonn' }

const mountCompare = (props: Record<string, unknown> = {}) => mountSuspended(MongocampDocumentCompare, { props: { left, right, ...props } })
const paths = (c: Awaited<ReturnType<typeof mountCompare>>) => c.findAll('tbody tr').map(tr => tr.attributes('data-path'))

describe('MongocampDocumentCompare', () => {
  it('shows every path with a text label for its status', async () => {
    const c = await mountCompare()
    expect(paths(c)).toEqual(['_id', 'name', 'age', 'tag', 'city'])
    expect(c.find('[data-path="age"]').text()).toContain('changed')
    expect(c.find('[data-path="tag"]').text()).toContain('removed')
    expect(c.find('[data-path="city"]').text()).toContain('added')
    expect(c.find('[data-path="name"]').text()).toContain('same')
  })

  it('summarises the counts', async () => {
    const c = await mountCompare()
    const text = c.find('[data-testid="compare-summary"]').text()
    expect(text).toContain('2 changed')
    expect(text).toContain('1 added')
    expect(text).toContain('1 removed')
    expect(text).toContain('1 same')
  })

  it('hides unchanged paths with "only differences"', async () => {
    const c = await mountCompare({ onlyDifferences: true })
    expect(paths(c)).toEqual(['_id', 'age', 'tag', 'city'])
  })

  it('says so when the documents are identical', async () => {
    const c = await mountCompare({ left, right: { ...left } })
    expect(c.find('[data-testid="compare-identical"]').exists()).toBe(true)
  })

  it('uses the given labels as column headers', async () => {
    const c = await mountCompare({ leftLabel: 'doc-1', rightLabel: 'doc-2' })
    const heads = c.findAll('thead th').map(th => th.text())
    expect(heads).toContain('doc-1')
    expect(heads).toContain('doc-2')
  })
})
