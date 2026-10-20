import { describe, it, expect } from 'vitest'
import { coerceRow, parseCsvRows, parseJsonRows, validateRows } from '../src/runtime/utils/importRows'
import { rowsToCsv } from '../src/runtime/utils/exportRows'

describe('parseJsonRows', () => {
  it('returns the objects of a JSON array', () => {
    const report = parseJsonRows('[{"a":1},{"b":"x"}]')
    expect(report.rows).toEqual([{ a: 1 }, { b: 'x' }])
    expect(report.errors).toEqual([])
  })

  it('ignores a byte order mark', () => {
    expect(parseJsonRows('﻿[{"a":1}]').rows).toEqual([{ a: 1 }])
  })

  it('reports invalid JSON, a non-array and an oversize file as file-level errors', () => {
    expect(parseJsonRows('[{').errors[0]).toMatchObject({ rowIndex: -1, code: 'invalid-json' })
    expect(parseJsonRows('{"a":1}').errors[0]).toMatchObject({ rowIndex: -1, code: 'not-array' })
    expect(parseJsonRows('[{"a":1}]', { maxRows: 10, maxBytes: 3 }).errors[0]).toMatchObject({ code: 'file-too-large' })
  })

  it('skips non-object elements and reports their source index', () => {
    const report = parseJsonRows('[{"a":1}, 5, null, [1], {"a":2}]')
    expect(report.rows).toEqual([{ a: 1 }, { a: 2 }])
    expect(report.errors.map(e => [e.rowIndex, e.code])).toEqual([[1, 'not-object'], [2, 'not-object'], [3, 'not-object']])
  })
})

describe('parseCsvRows', () => {
  it('reads a header and maps each record to an object of strings', () => {
    const report = parseCsvRows('a,b\r\n1,x\r\n2,y\r\n')
    expect(report.columns).toEqual(['a', 'b'])
    expect(report.rows).toEqual([{ a: '1', b: 'x' }, { a: '2', b: 'y' }])
  })

  it('handles quoted commas, doubled quotes and line breaks inside a cell', () => {
    const report = parseCsvRows('a,b,c\n"one, two","say ""hi""","line\nbreak"')
    expect(report.rows).toEqual([{ a: 'one, two', b: 'say "hi"', c: 'line\nbreak' }])
  })

  it('accepts LF, CRLF and CR line endings, a BOM, blank lines and a custom delimiter', () => {
    expect(parseCsvRows('﻿a;b\r1;2\n\n3;4', ';').rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })

  it('keeps empty cells as empty strings and pads short rows', () => {
    expect(parseCsvRows('a,b,c\n1,,\n2').rows).toEqual([{ a: '1', b: '', c: '' }, { a: '2', b: '', c: '' }])
  })

  it('reports a row with too many fields by data-row index and keeps the rest', () => {
    const report = parseCsvRows('a,b\n1,2\n3,4,5\n6,7')
    expect(report.rows).toEqual([{ a: '1', b: '2' }, { a: '6', b: '7' }])
    expect(report.errors).toEqual([expect.objectContaining({ rowIndex: 1, code: 'field-count' })])
  })

  it('rejects an unclosed quote, duplicate/empty headers, a missing header and a bad delimiter', () => {
    expect(parseCsvRows('a,b\n"1,2').errors[0]).toMatchObject({ code: 'invalid-csv' })
    expect(parseCsvRows('a,a\n1,2').errors[0]).toMatchObject({ code: 'invalid-header' })
    expect(parseCsvRows('a,\n1,2').errors[0]).toMatchObject({ code: 'invalid-header' })
    expect(parseCsvRows('').errors[0]).toMatchObject({ code: 'invalid-csv' })
    expect(parseCsvRows('a,b', '"').errors[0]).toMatchObject({ code: 'invalid-delimiter' })
  })

  it('round-trips what rowsToCsv writes', () => {
    const rows = [{ a: 'one, two', b: 'say "hi"', c: 'line\nbreak' }, { a: '', b: 'x', c: '3' }]
    expect(parseCsvRows(rowsToCsv(rows, ['a', 'b', 'c'])).rows).toEqual(rows)
  })
})

describe('coerceRow', () => {
  it('converts numbers, booleans, dates and JSON by column type', () => {
    const { row, errors } = coerceRow(
      { n: '3.5', b: 'Yes', d: '2024-03-01T10:00:00Z', j: '{"x":[1]}', s: 'text' },
      { n: 'number', b: 'boolean', d: 'date-time', j: 'json' },
    )
    expect(errors).toEqual([])
    expect(row).toEqual({ n: 3.5, b: true, d: '2024-03-01T10:00:00.000Z', j: { x: [1] }, s: 'text' })
  })

  it('refuses an integer beyond the safe range instead of silently rounding it', () => {
    expect(coerceRow({ n: '9007199254740991' }, { n: 'number' }).row.n).toBe(9007199254740991)
    expect(coerceRow({ n: '12345678901234567' }, { n: 'number' }).errors[0]).toMatchObject({ column: 'n', code: 'unsafe-integer' })
    expect(coerceRow({ n: '1e999' }, { n: 'number' }).errors[0]).toMatchObject({ code: 'invalid-number' })
    expect(coerceRow({ n: '12345678901234567' }, { n: 'string' }).row.n).toBe('12345678901234567')
  })

  it('reads a date without an offset as UTC and a bare date as midnight UTC', () => {
    expect(coerceRow({ d: '2024-03-01 10:30' }, { d: 'date-time' }).row.d).toBe('2024-03-01T10:30:00.000Z')
    expect(coerceRow({ d: '2024-03-01' }, { d: 'date-time' }).row.d).toBe('2024-03-01T00:00:00.000Z')
    expect(coerceRow({ d: '2024-03-01T10:00:00+02:00' }, { d: 'date-time' }).row.d).toBe('2024-03-01T08:00:00.000Z')
  })

  it('reports cells that do not convert and leaves them out of the row', () => {
    const { row, errors } = coerceRow(
      { n: 'abc', b: 'maybe', d: 'yesterday', j: '{bad', ok: '1' },
      { n: 'number', b: 'boolean', d: 'date-time', j: 'json', ok: 'number' },
    )
    expect(row).toEqual({ ok: 1 })
    expect(errors.map(e => [e.column, e.code])).toEqual([
      ['n', 'invalid-number'], ['b', 'invalid-boolean'], ['d', 'invalid-date'], ['j', 'invalid-json-value'],
    ])
  })

  it('omits empty cells for typed columns and lets the option decide for string columns', () => {
    const types = { n: 'number', s: 'string' } as const
    expect(coerceRow({ n: ' ', s: '' }, types).row).toEqual({})
    expect(coerceRow({ n: '', s: '' }, types, { emptyCells: 'empty-string' }).row).toEqual({ s: '' })
  })

  it('passes non-string values through untouched', () => {
    expect(coerceRow({ a: 5, b: { x: 1 } }, { a: 'string' }).row).toEqual({ a: 5, b: { x: 1 } })
  })
})

describe('validateRows', () => {
  it('keeps plain rows, including a valid 24-hex _id', () => {
    const rows = [{ a: 1, nested: { b: [1, 2] } }, { _id: '6ad7cc585b8b911e12c58cc5', a: 2 }]
    expect(validateRows(rows)).toMatchObject({ rows, errors: [], truncated: false })
  })

  it('refuses an _id the server would reject (not a 24-hex string)', () => {
    const report = validateRows([{ _id: 'dup1' }, { _id: 5 }, { _id: { $oid: '6ad7cc585b8b911e12c58cc5' } }, { _id: 'ZZZZcc585b8b911e12c58cc5' }])
    expect(report.rows).toEqual([])
    expect(report.errors.map(e => [e.rowIndex, e.code, e.column])).toEqual([[0, 'invalid-id', '_id'], [1, 'invalid-id', '_id'], [2, 'invalid-id', '_id'], [3, 'invalid-id', '_id']])
  })

  it('drops empty rows and rows with operator-like or __proto__ keys, naming the key path', () => {
    const rows = [
      {},
      { $set: { a: 1 } },
      { nested: { $where: 'x' } },
      { list: [{ $gt: 1 }] },
      JSON.parse('{"__proto__":{"x":1}}') as Record<string, unknown>,
      { ok: 1 },
    ]
    const report = validateRows(rows)
    expect(report.rows).toEqual([{ ok: 1 }])
    expect(report.errors.map(e => [e.rowIndex, e.code, e.column])).toEqual([
      [0, 'empty-row', undefined],
      [1, 'forbidden-key', '$set'],
      [2, 'forbidden-key', 'nested.$where'],
      [3, 'forbidden-key', 'list[0].$gt'],
      [4, 'forbidden-key', '__proto__'],
    ])
  })

  it('refuses extended-JSON wrappers at any level (they must be unwrapped first)', () => {
    expect(validateRows([{ $date: '2024-01-01' }]).errors[0]).toMatchObject({ code: 'forbidden-key', column: '$date' })
    expect(validateRows([{ when: { $date: '2024-01-01T00:00:00Z' } }]).errors[0]).toMatchObject({ code: 'forbidden-key', column: 'when.$date' })
  })

  it('caps the row count and flags truncation', () => {
    const report = validateRows([{ a: 1 }, { a: 2 }, { a: 3 }], { maxRows: 2, maxBytes: 1000 })
    expect(report.rows).toEqual([{ a: 1 }, { a: 2 }])
    expect(report.truncated).toBe(true)
    expect(report.errors).toEqual([expect.objectContaining({ rowIndex: -1, code: 'too-many-rows' })])
  })

  it('rejects rows nested deeper than the limit', () => {
    let deep: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 70; i++) deep = { n: deep }
    expect(validateRows([deep]).errors[0]).toMatchObject({ code: 'too-deep' })
  })
})
