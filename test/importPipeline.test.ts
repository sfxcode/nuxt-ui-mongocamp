import { describe, it, expect } from 'vitest'
import { detectImportFormat, prepareImport } from '../src/runtime/utils/importPipeline'
import { inferColumnTypes } from '../src/runtime/utils/importRows'

describe('inferColumnTypes', () => {
  it('guesses boolean, number, date-time and falls back to string', () => {
    const rows = [
      { b: 'true', n: '1', d: '2024-01-01', s: 'x', e: '' },
      { b: 'No', n: '2.5', d: '2024-02-01T10:00:00Z', s: '3', e: '' },
    ]
    expect(inferColumnTypes(rows, ['b', 'n', 'd', 's', 'e'])).toEqual({ b: 'boolean', n: 'number', d: 'date-time', s: 'string', e: 'string' })
  })

  it('keeps leading-zero and unsafe integers as text so no digit changes', () => {
    const rows = [{ zip: '01234', big: '12345678901234567', zero: '0', dec: '0.5' }]
    expect(inferColumnTypes(rows, ['zip', 'big', 'zero', 'dec'])).toEqual({ zip: 'string', big: 'string', zero: 'number', dec: 'number' })
  })

  it('ignores empty cells when deciding and treats 0/1 as numbers, not booleans', () => {
    expect(inferColumnTypes([{ a: '1' }, { a: '' }, { a: '0' }], ['a'])).toEqual({ a: 'number' })
  })
})

describe('detectImportFormat', () => {
  it('goes by extension first, then by the first character', () => {
    expect(detectImportFormat('data.JSON', 'a,b')).toBe('json')
    expect(detectImportFormat('data.csv', '[1]')).toBe('csv')
    expect(detectImportFormat('data.txt', '\uFEFF [{"a":1}]')).toBe('json')
    expect(detectImportFormat('data.txt', 'a,b\n1,2')).toBe('csv')
  })
})

describe('prepareImport — JSON', () => {
  it('unwraps extended JSON so dates and ids become plain values', () => {
    const text = JSON.stringify([{ _id: { $oid: '6ad7cc585b8b911e12c58cc5' }, when: { $date: '2024-01-01T00:00:00Z' }, n: { $numberInt: '5' } }])
    const prepared = prepareImport({ format: 'json', text })

    expect(prepared.errors).toEqual([])
    expect(prepared.rows).toEqual([{ _id: '6ad7cc585b8b911e12c58cc5', when: '2024-01-01T00:00:00.000Z', n: 5 }])
    expect(prepared.columns).toEqual(['_id', 'when', 'n'])
  })

  it('traces dropped rows back to their position in the file', () => {
    const text = JSON.stringify([{ a: 1 }, 7, { $set: 1 }, { a: 2 }, {}])
    const prepared = prepareImport({ format: 'json', text })

    expect(prepared.rows).toEqual([{ a: 1 }, { a: 2 }])
    expect(prepared.sourceIndexes).toEqual([0, 3])
    expect(prepared.errors.map(e => [e.rowIndex, e.code]).sort((x, y) => x[0] as number - (y[0] as number))).toEqual([
      [1, 'not-object'], [2, 'forbidden-key'], [4, 'empty-row'],
    ])
    expect(prepared.sourceRowCount).toBe(5)
  })

  it('reports a file-level problem once and returns no rows', () => {
    const prepared = prepareImport({ format: 'json', text: '{"a":1}' })
    expect(prepared.rows).toEqual([])
    expect(prepared.errors).toEqual([expect.objectContaining({ rowIndex: -1, code: 'not-array' })])
  })
})

describe('prepareImport — CSV', () => {
  const text = 'name,age,active,joined\nAnn,31,yes,2024-01-05\nBob,x,no,2024-02-01\nCy,45,true,2024-03-09\n'

  it('infers types, converts the cells and reports the row whose cell does not convert', () => {
    const prepared = prepareImport({ format: 'csv', text, columnTypes: { name: 'string', age: 'number', active: 'boolean', joined: 'date-time' } })

    expect(prepared.rows).toEqual([
      { name: 'Ann', age: 31, active: true, joined: '2024-01-05T00:00:00.000Z' },
      { name: 'Cy', age: 45, active: true, joined: '2024-03-09T00:00:00.000Z' },
    ])
    expect(prepared.sourceIndexes).toEqual([0, 2])
    expect(prepared.errors).toEqual([expect.objectContaining({ rowIndex: 1, column: 'age', code: 'invalid-number' })])
  })

  it('returns the inferred types when none are given (age becomes string because of "x")', () => {
    const prepared = prepareImport({ format: 'csv', text })
    expect(prepared.columnTypes).toEqual({ name: 'string', age: 'string', active: 'boolean', joined: 'date-time' })
    expect(prepared.errors).toEqual([])
    expect(prepared.rows).toHaveLength(3)
  })

  it('maps validation errors (invalid _id) to the file row and keeps the rest', () => {
    const prepared = prepareImport({ format: 'csv', text: '_id,a\n6ad7cc585b8b911e12c58cc5,1\nnot-hex,2\n,3\n' })
    expect(prepared.rows.map(r => r.a)).toEqual([1, 3])
    expect(prepared.sourceIndexes).toEqual([0, 2])
    expect(prepared.errors).toEqual([expect.objectContaining({ rowIndex: 1, column: '_id', code: 'invalid-id' })])
  })

  it('honours the row cap and the delimiter, and flags truncation', () => {
    const prepared = prepareImport({ format: 'csv', text: 'a;b\n1;2\n3;4\n5;6', delimiter: ';', limits: { maxRows: 2, maxBytes: 1000 } })
    expect(prepared.rows).toHaveLength(2)
    expect(prepared.truncated).toBe(true)
    expect(prepared.columns).toEqual(['a', 'b'])
  })

  it('passes the empty-cell choice through to string columns', () => {
    const omit = prepareImport({ format: 'csv', text: 'a,b\nx,\n' })
    const keep = prepareImport({ format: 'csv', text: 'a,b\nx,\n', emptyCells: 'empty-string' })
    expect(omit.rows).toEqual([{ a: 'x' }])
    expect(keep.rows).toEqual([{ a: 'x', b: '' }])
  })
})
