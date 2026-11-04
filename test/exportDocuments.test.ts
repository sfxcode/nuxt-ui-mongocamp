import { describe, it, expect } from 'vitest'
import { exportColumns, exportFilename, formatDocuments, toExportRow } from '../src/runtime/utils/exportDocuments'
import { rowsToCsv } from '../src/runtime/utils/exportRows'

const long = (digits: string) => ({ $numberLong: digits })

describe('toExportRow', () => {
  it('unwraps the wrappers like the table does', () => {
    expect(toExportRow({ _id: { $oid: 'abc' }, when: { $date: '2024-03-01T10:00:00.000Z' }, n: { $numberInt: '7' }, d: { $numberDecimal: '1.50' }, nested: { id: { $oid: 'x' } } }))
      .toEqual({ _id: 'abc', when: '2024-03-01T10:00:00.000Z', n: 7, d: 1.5, nested: { id: 'x' } })
  })

  it('keeps an integer beyond 2^53 exact as a BigInt, wherever it is', () => {
    const row = toExportRow({ a: long('9007199254740993'), nested: { b: long('-9223372036854775808') }, list: [long('9223372036854775807')] })

    expect(row.a).toBe(9007199254740993n)
    expect((row.nested as { b: bigint }).b).toBe(-9223372036854775808n)
    expect((row.list as bigint[])[0]).toBe(9223372036854775807n)
  })

  it('turns a safe $numberLong into a plain number, and leaves a $date holding a long to unwrap', () => {
    expect(toExportRow({ a: long('5'), when: { $date: { $numberLong: '1718452800000' } } })).toEqual({ a: 5, when: '2024-06-15T12:00:00.000Z' })
  })

  it('does not change what is not a wrapper, including an object that merely has a $numberLong key next to others', () => {
    expect(toExportRow({ s: 'x', n: 1, t: true, z: null, o: { $numberLong: '9007199254740993', other: 1 } })).toMatchObject({ s: 'x', n: 1, t: true, z: null })
  })
})

describe('formatDocuments — json', () => {
  const rows = [{ _id: 'a', n: 1 }, { _id: 'b', n: 2 }]

  it('writes an array with one document per line', () => {
    expect(formatDocuments(rows, 'json')).toBe('[\n  {"_id":"a","n":1},\n  {"_id":"b","n":2}\n]\n')
    expect(JSON.parse(formatDocuments(rows, 'json'))).toEqual(rows)
  })

  it('pretty: the 2-space indentation the page export always used, no trailing newline', () => {
    expect(formatDocuments(rows, 'json', { pretty: true })).toBe(JSON.stringify(rows, null, 2))
  })

  it('writes an empty array for no rows', () => {
    expect(formatDocuments([], 'json')).toBe('[]\n')
    expect(formatDocuments([], 'json', { pretty: true })).toBe('[]')
  })

  it('writes an integer beyond 2^53 as a bare number with every digit — a JSON.parse would round it, other tools would not', () => {
    const text = formatDocuments([toExportRow({ big: long('9007199254740993'), small: 1 })], 'json')

    expect(text).toContain('"big":9007199254740993,')
    expect(text).not.toContain('"9007199254740993"')
    expect(JSON.parse(text)[0].big).toBe(9007199254740992) // what a rounding reader sees; the file itself is exact
    expect(formatDocuments([toExportRow({ b: long('9223372036854775807') })], 'json', { pretty: true })).toContain('"b": 9223372036854775807')
  })

  it('never turns a string that looks like a long into a number, nor a string with odd characters', () => {
    const text = formatDocuments([{ s: '9007199254740993', t: '\u0000LONG1:5', u: 'a"b\\c\nd' }], 'json')

    expect(JSON.parse(text)).toEqual([{ s: '9007199254740993', t: '\u0000LONG1:5', u: 'a"b\\c\nd' }])
  })
})

describe('formatDocuments — ndjson', () => {
  it('writes one compact document per line with a closing newline', () => {
    expect(formatDocuments([{ a: 1 }, { b: 'x' }], 'ndjson')).toBe('{"a":1}\n{"b":"x"}\n')
  })

  it('writes nothing for no rows, keeps exact longs and keeps newlines inside strings escaped (one line per document)', () => {
    expect(formatDocuments([], 'ndjson')).toBe('')
    const text = formatDocuments([toExportRow({ big: long('9007199254740993'), s: 'line1\nline2' })], 'ndjson')
    expect(text).toBe('{"big":9007199254740993,"s":"line1\\nline2"}\n')
    expect(text.trimEnd().split('\n')).toHaveLength(1)
  })
})

describe('formatDocuments — csv', () => {
  it('writes a header and one row per document, with RFC 4180 quoting', () => {
    const csv = formatDocuments([{ _id: 'a', name: 'one, two', note: 'say "hi"' }, { _id: 'b', name: 'x', note: 'l1\nl2' }], 'csv')

    expect(csv).toBe('_id,name,note\r\na,"one, two","say ""hi"""\r\nb,x,"l1\nl2"')
  })

  it('uses the keys of all rows in order of first appearance with _id first, so a later key is not lost', () => {
    const rows = [{ name: 'a', _id: '1' }, { name: 'b', extra: 5, _id: '2' }, { other: true }]

    expect(exportColumns(rows)).toEqual(['_id', 'name', 'extra', 'other'])
    expect(formatDocuments(rows, 'csv')).toBe('_id,name,extra,other\r\n1,a,,\r\n2,b,5,\r\n,,,true')
  })

  it('writes nested objects and arrays as one cell of JSON text, nulls and missing values empty', () => {
    expect(formatDocuments([{ a: { x: 1 }, b: [1, 2], c: null }], 'csv')).toBe('a,b,c\r\n"{""x"":1}","[1,2]",')
  })

  it('writes an exact long as its digits, also inside a nested value', () => {
    const csv = formatDocuments([toExportRow({ big: long('9007199254740993'), nested: { big: long('9223372036854775807') } })], 'csv')

    expect(csv).toBe('big,nested\r\n9007199254740993,"{""big"":""9223372036854775807""}"')
  })

  it('takes the columns in the order given, with a header even for no rows', () => {
    expect(formatDocuments([{ a: 1, b: 2 }], 'csv', { columns: ['b', 'a', 'missing'] })).toBe('b,a,missing\r\n2,1,')
    expect(formatDocuments([], 'csv', { columns: ['a', 'b'] })).toBe('a,b')
    expect(formatDocuments([], 'csv')).toBe('')
  })

  it('writes the same text as rowsToCsv for ordinary data', () => {
    const rows = [{ a: 1, b: 'x' }]

    expect(formatDocuments(rows, 'csv')).toBe(rowsToCsv(rows, ['a', 'b']))
  })
})

describe('exportFilename', () => {
  const at = new Date(2024, 11, 31, 23, 5)

  it('is the collection, a local timestamp and the extension', () => {
    expect(exportFilename('customers', 'csv', at)).toBe('customers-20241231-2305.csv')
    expect(exportFilename('customers', 'ndjson', at)).toBe('customers-20241231-2305.ndjson')
    expect(exportFilename('customers', 'json', new Date(2024, 0, 2, 3, 4))).toBe('customers-20240102-0304.json')
  })

  it('makes the collection name safe for a file name but keeps dots, dashes and underscores', () => {
    expect(exportFilename('images.files', 'json', at)).toBe('images.files-20241231-2305.json')
    expect(exportFilename('my coll/ection?', 'json', at)).toBe('my_coll_ection_-20241231-2305.json')
    expect(exportFilename('', 'json', at)).toBe('export-20241231-2305.json')
  })
})
