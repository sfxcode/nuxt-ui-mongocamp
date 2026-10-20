import { describe, it, expect } from 'vitest'
import { formatCell, resultColumns } from '../src/runtime/utils/aggregationResult'

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
