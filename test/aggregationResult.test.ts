import { describe, it, expect } from 'vitest'
import { formatCell, resultColumns, stripServerFields } from '../src/runtime/utils/aggregationResult'

describe('resultColumns', () => {
  it('collects the keys of all rows in order of appearance with _id first', () => {
    expect(resultColumns([{ total: 1, _id: 'A' }, { _id: 'B', total: 2, extra: 3 }])).toEqual(['_id', 'total', 'extra'])
  })

  it('returns no columns for no rows and does not invent an _id', () => {
    expect(resultColumns([])).toEqual([])
    expect(resultColumns([{ a: 1 }])).toEqual(['a'])
  })

  it('caps the number of columns', () => {
    const wide = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i]))
    expect(resultColumns([wide]).length).toBeLessThanOrEqual(100)
  })

  it('looks only at the first rows, so a huge page stays cheap', () => {
    const rows = Array.from({ length: 300 }, (_, i) => (i === 250 ? { late: 1 } : { a: i }))
    expect(resultColumns(rows)).toEqual(['a'])
  })
})

describe('formatCell', () => {
  it('shows scalars as text, null as "null" and a missing value as empty', () => {
    expect(formatCell('x').text).toBe('x')
    expect(formatCell(3.5).text).toBe('3.5')
    expect(formatCell(false).text).toBe('false')
    expect(formatCell(null).text).toBe('null')
    expect(formatCell(undefined).text).toBe('')
  })

  it('shows objects and arrays as compact JSON', () => {
    expect(formatCell({ a: [1, 2] }).text).toBe('{"a":[1,2]}')
    expect(formatCell(['x']).text).toBe('["x"]')
  })

  it('shortens a long value with an ellipsis but keeps the full text', () => {
    const long = 'x'.repeat(200)
    const cell = formatCell(long)
    expect(cell.text).toHaveLength(80)
    expect(cell.text.endsWith('…')).toBe(true)
    expect(cell.full).toBe(long)
  })
})

describe('stripServerFields', () => {
  it('removes the database host and namespace from every row, keeping the numbers', () => {
    const rows = [
      { name: '_id_', host: '2797c7a9bf90:27017', accesses: { ops: 3, since: '2026-11-03T19:55:38Z' }, key: { _id: 1 } },
      { ns: 'mongocamp.customers', host: 'db-1:27017', count: 12, storageStats: { size: 1000 } },
    ]

    expect(stripServerFields(rows)).toEqual([
      { name: '_id_', accesses: { ops: 3, since: '2026-11-03T19:55:38Z' }, key: { _id: 1 } },
      { count: 12, storageStats: { size: 1000 } },
    ])
  })

  it('does not change its input and handles no rows', () => {
    const rows = [{ host: 'x:1', a: 1 }]

    stripServerFields(rows)

    expect(rows).toEqual([{ host: 'x:1', a: 1 }])
    expect(stripServerFields([])).toEqual([])
  })

  it('only touches the top level: a nested field called host is data', () => {
    expect(stripServerFields([{ a: { host: 'kept' } }])).toEqual([{ a: { host: 'kept' } }])
  })
})
