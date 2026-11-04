import { describe, expect, it } from 'vitest'
import { allContainerPaths, buildDocumentTree, defaultExpanded, nodeDisplay, visibleNodes } from '../src/runtime/utils/documentTree'
import { valueToJson } from '../src/runtime/utils/exportDocuments'
import { getPath } from '../src/runtime/utils/documentPaths'

const doc = {
  _id: { $oid: 'a'.repeat(24) },
  name: 'A',
  at: { $date: '2025-01-02T03:04:05.000Z' },
  big: { $numberLong: '9007199254740993' },
  address: { city: 'X', geo: { lat: 1, lon: 2 } },
  tags: ['a', 'b'],
  empty: [],
  none: null,
}

describe('buildDocumentTree', () => {
  it('builds typed nodes with paths that getPath reads back', () => {
    const tree = buildDocumentTree(doc)
    expect(tree.truncated).toBe(false)
    expect(tree.nodes.map(n => [n.key, n.type])).toEqual([['_id', 'objectId'], ['name', 'string'], ['at', 'date'], ['big', 'long'], ['address', 'object'], ['tags', 'array'], ['empty', 'array'], ['none', 'null']])
    const geo = tree.nodes[4]!.children![1]!
    expect(geo.path).toBe('address.geo')
    expect(getPath(doc, geo.path)).toBe(geo.value)
    expect(tree.nodes[5]!.children!.map(n => n.path)).toEqual(['tags.0', 'tags.1'])
  })

  it('keeps a wrapper and an empty container as leaves', () => {
    const tree = buildDocumentTree(doc)
    expect(tree.nodes[0]!.children).toBeNull()
    expect(tree.nodes[6]!.children).toBeNull()
  })

  it('stops at the node limit and says so', () => {
    const tree = buildDocumentTree({ list: Array.from({ length: 50 }, (_, i) => i) }, { maxNodes: 10 })
    expect(tree.total).toBe(10)
    expect(tree.truncated).toBe(true)
  })
})

describe('expansion', () => {
  it('opens the first two levels of a small document and nothing of a large one', () => {
    const open = defaultExpanded(buildDocumentTree(doc))
    expect([...open].sort()).toEqual(['address', 'tags'])
    const large = buildDocumentTree({ a: { b: 1 }, items: Array.from({ length: 300 }, (_, i) => i) })
    expect(defaultExpanded(large).size).toBe(0)
  })

  it('shows children only of open nodes, and all containers on request', () => {
    const tree = buildDocumentTree(doc)
    expect(visibleNodes(tree, new Set()).map(n => n.path)).toEqual(['_id', 'name', 'at', 'big', 'address', 'tags', 'empty', 'none'])
    expect(visibleNodes(tree, new Set(['address'])).map(n => n.path)).toContain('address.city')
    expect(visibleNodes(tree, new Set(['address'])).map(n => n.path)).not.toContain('address.geo.lat')
    expect([...allContainerPaths(tree)].sort()).toEqual(['address', 'address.geo', 'tags'])
  })
})

describe('nodeDisplay', () => {
  const display = (value: unknown) => nodeDisplay(buildDocumentTree({ v: value }).nodes[0]!)

  it('shows what a wrapper holds, every digit of a long and sizes of containers', () => {
    expect(display({ $oid: 'b'.repeat(24) }).text).toBe('b'.repeat(24))
    expect(display({ $numberLong: '9223372036854775807' }).text).toBe('9223372036854775807')
    expect(display({ $numberDecimal: '1.50' }).text).toBe('1.50')
    expect(display({ $numberInt: '7' }).text).toBe('7')
    expect(display([1, 2, 3]).text).toBe('[3]')
    expect(display({ a: 1 }).text).toBe('{1}')
    expect(display(null).text).toBe('null')
    expect(display(true).text).toBe('true')
    expect(display('x').text).toBe('x')
  })

  it('gives a date its text and a localised title', () => {
    const shown = display({ $date: '2025-01-02T03:04:05.000Z' })
    expect(shown.text).toBe('2025-01-02T03:04:05.000Z')
    expect(shown.title).toBe(new Date('2025-01-02T03:04:05.000Z').toLocaleString())
    expect(display({ $date: 'not a date' }).title).toBeUndefined()
  })
})

describe('valueToJson', () => {
  it('writes wrappers as plain values and keeps a long exact', () => {
    const text = valueToJson({ _id: { $oid: 'a'.repeat(24) }, big: { $numberLong: '9007199254740993' }, n: { $numberInt: '3' } }, false)
    expect(text).toBe(`{"_id":"${'a'.repeat(24)}","big":9007199254740993,"n":3}`)
  })

  it('works for any value and indents by default', () => {
    expect(valueToJson([1, { a: 2 }], false)).toBe('[1,{"a":2}]')
    expect(valueToJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(valueToJson('x', false)).toBe('"x"')
  })
})
