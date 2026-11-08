import { describe, it, expect } from 'vitest'
import { unwrapExtendedJson, wrapExtendedJson } from '../src/runtime/composables/useMongocampExtendedJson'

describe('unwrapExtendedJson', () => {
  it('unwraps an $oid to the plain string', () => {
    expect(unwrapExtendedJson({ _id: { $oid: '507f1f77bcf86cd799439011' } })).toEqual({ _id: '507f1f77bcf86cd799439011' })
  })

  it('leaves a plain string untouched', () => {
    expect(unwrapExtendedJson({ name: 'Alice' })).toEqual({ name: 'Alice' })
  })

  it('unwraps a $date ISO string to the same ISO string', () => {
    expect(unwrapExtendedJson({ createdAt: { $date: '2024-01-15T10:30:00.000Z' } }))
      .toEqual({ createdAt: '2024-01-15T10:30:00.000Z' })
  })

  it('unwraps a $date epoch-millis number to the equivalent ISO string', () => {
    const millis = new Date('2024-01-15T10:30:00.000Z').getTime()
    expect(unwrapExtendedJson({ createdAt: { $date: millis } }))
      .toEqual({ createdAt: '2024-01-15T10:30:00.000Z' })
  })

  it('unwraps a $date wrapping a $numberLong to the equivalent ISO string', () => {
    const millis = new Date('2024-01-15T10:30:00.000Z').getTime()
    expect(unwrapExtendedJson({ createdAt: { $date: { $numberLong: String(millis) } } }))
      .toEqual({ createdAt: '2024-01-15T10:30:00.000Z' })
  })

  it.each(['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'])('unwraps %s to a JS number', (key) => {
    expect(unwrapExtendedJson({ count: { [key]: '42' } })).toEqual({ count: 42 })
  })

  it('recurses through a nested object', () => {
    expect(unwrapExtendedJson({
      meta: { ownerId: { $oid: 'abc123' }, updatedAt: { $date: '2024-01-15T10:30:00.000Z' } },
    })).toEqual({
      meta: { ownerId: 'abc123', updatedAt: '2024-01-15T10:30:00.000Z' },
    })
  })

  it('recurses through every item of an array of objects', () => {
    expect(unwrapExtendedJson({ items: [{ sku: { $oid: 'a1' } }, { sku: { $oid: 'b2' } }] }))
      .toEqual({ items: [{ sku: 'a1' }, { sku: 'b2' }] })
  })

  it('passes a scalar array through as-is', () => {
    expect(unwrapExtendedJson({ tags: ['a', 'b'] })).toEqual({ tags: ['a', 'b'] })
  })

  it('leaves non-object, non-array values untouched', () => {
    expect(unwrapExtendedJson('plain')).toBe('plain')
    expect(unwrapExtendedJson(42)).toBe(42)
    expect(unwrapExtendedJson(null)).toBe(null)
  })
})

describe('wrapExtendedJson', () => {
  it('rewraps a plain ISO string to { $date: isoString }', () => {
    const doc = wrapExtendedJson({ createdAt: '2024-01-15T10:30:00.000Z' })
    expect(doc.createdAt).toEqual({ $date: '2024-01-15T10:30:00.000Z' })
  })

  it('rewraps a string back to { $oid: value } when the original was $oid-wrapped', () => {
    const originalDoc = { _ownerId: { $oid: '507f1f77bcf86cd799439011' } }
    const doc = wrapExtendedJson({ _ownerId: '507f1f77bcf86cd799439011' }, originalDoc)
    expect(doc._ownerId).toEqual({ $oid: '507f1f77bcf86cd799439011' })
  })

  it('leaves a plain string field alone when the original was not $oid-wrapped', () => {
    const doc = wrapExtendedJson({ name: 'Alice' }, { name: 'Bob' })
    expect(doc.name).toBe('Alice')
  })

  it('preserves an originalDoc field not present in formData (full-replace safety)', () => {
    const originalDoc = { name: 'Alice', age: 30, legacyFlag: true }
    const doc = wrapExtendedJson({ name: 'Alice', age: 31 }, originalDoc)
    expect(doc).toEqual({ name: 'Alice', age: 31, legacyFlag: true })
  })

  it('contains only the rewrapped form fields when originalDoc is omitted (insert case)', () => {
    const doc = wrapExtendedJson({ name: 'Alice', age: 30 })
    expect(doc).toEqual({ name: 'Alice', age: 30 })
  })

  it('never includes _id in the output, even if present in formData or originalDoc', () => {
    const originalDoc = { _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Bob' }
    const doc = wrapExtendedJson({ _id: 'should-be-stripped', name: 'Alice' }, originalDoc)
    expect(doc).not.toHaveProperty('_id')
    expect(doc.name).toBe('Alice')
  })

  it('passes plain numbers and booleans through untouched', () => {
    const doc = wrapExtendedJson({ age: 30, active: true })
    expect(doc).toEqual({ age: 30, active: true })
  })

  it('recurses through a nested object, rewrapping $oid fields against the matching originalDoc branch', () => {
    const originalDoc = { meta: { ownerId: { $oid: 'abc123' } } }
    const doc = wrapExtendedJson({ meta: { ownerId: 'abc123', note: 'hi' } }, originalDoc)
    expect(doc.meta).toEqual({ ownerId: { $oid: 'abc123' }, note: 'hi' })
  })

  it('recurses through an array of objects, rewrapping each item against the matching originalDoc item by index', () => {
    const originalDoc = { items: [{ ownerId: { $oid: 'a1' } }, { ownerId: { $oid: 'b2' } }] }
    const doc = wrapExtendedJson({ items: [{ ownerId: 'a1' }, { ownerId: 'b2' }] }, originalDoc)
    expect(doc.items).toEqual([{ ownerId: { $oid: 'a1' } }, { ownerId: { $oid: 'b2' } }])
  })

  it('rewraps a new array-of-objects item (no matching originalDoc item) without crashing', () => {
    const originalDoc = { items: [{ ownerId: { $oid: 'a1' } }] }
    const doc = wrapExtendedJson({ items: [{ ownerId: 'a1' }, { ownerId: 'b2' }] }, originalDoc)
    expect(doc.items).toEqual([{ ownerId: { $oid: 'a1' } }, { ownerId: 'b2' }])
  })
})

describe('64-bit integers beyond 2^53', () => {
  const big = { $numberLong: '9007199254740993' }

  it('unwrap keeps an unsafe $numberLong as its exact digit string', () => {
    expect(unwrapExtendedJson(big)).toBe('9007199254740993')
    expect(unwrapExtendedJson({ n: { $numberLong: '-9223372036854775808' } })).toEqual({ n: '-9223372036854775808' })
    expect(unwrapExtendedJson([big, { x: big }])).toEqual(['9007199254740993', { x: '9007199254740993' }])
  })

  it('unwrap turns a safe $numberLong, $numberInt and $numberDouble into numbers as before', () => {
    expect(unwrapExtendedJson({ $numberLong: '9007199254740991' })).toBe(9007199254740991)
    expect(unwrapExtendedJson({ $numberLong: '5' })).toBe(5)
    expect(unwrapExtendedJson({ $numberInt: '7' })).toBe(7)
    expect(unwrapExtendedJson({ $numberDouble: '2.5' })).toBe(2.5)
    expect(unwrapExtendedJson({ $numberDecimal: '1.50' })).toBe(1.5)
  })

  it('unwrap with exactLongs: false gives the rounded number (for type inference)', () => {
    expect(typeof unwrapExtendedJson(big, { exactLongs: false })).toBe('number')
    expect(unwrapExtendedJson({ rows: [big] }, { exactLongs: false })).toEqual({ rows: [Number('9007199254740993')] })
  })

  it('wrap puts the exact digits back as the wrapper when the original was a $numberLong wrapper', () => {
    expect(wrapExtendedJson({ n: '9007199254740993' }, { n: big })).toEqual({ n: big })
    expect(wrapExtendedJson({ n: '9007199254740995' }, { n: big })).toEqual({ n: { $numberLong: '9007199254740995' } })
    expect(wrapExtendedJson({ list: [{ n: '9007199254740995' }] }, { list: [{ n: big }] })).toEqual({ list: [{ n: { $numberLong: '9007199254740995' } }] })
  })

  it('wrap leaves a non-digit text, or a field that was not a long, as plain text', () => {
    expect(wrapExtendedJson({ n: 'abc' }, { n: big })).toEqual({ n: 'abc' })
    expect(wrapExtendedJson({ n: '9007199254740993' }, { n: 'x' })).toEqual({ n: '9007199254740993' })
    expect(wrapExtendedJson({ n: '9007199254740993' })).toEqual({ n: '9007199254740993' })
  })

  it('a form round trip of an untouched long is exactly the original', () => {
    const row = { _id: { $oid: 'a' }, n: big, name: 'x' }
    const form = unwrapExtendedJson(row) as Record<string, unknown>

    expect(wrapExtendedJson(form, row)).toEqual({ n: big, name: 'x' })
  })
})

// recorded from server 1.8.1 (`extendedJson=canonical`, live 2026-11-08)
const CANONICAL = {
  _id: { $oid: '6af0b563539838117f61b2f9' },
  s: { $string: '2026-01-01T00:00:00.000Z' },
  i: { $numberInt: '5' },
  l: { $numberLong: '9007199254740993' },
  name: 'x',
  db: { $numberDouble: '1.5' },
  dc: { $numberDecimal: '2.50' },
  o: { $oid: '507f1f77bcf86cd799439022' },
  t: { $date: { $numberLong: '1772496000000' } },
}

describe('a typed (canonical) document', () => {
  it('unwraps to plain form values: text that looks like a date stays text, a canonical date is its ISO instant, a long keeps its digits', () => {
    expect(unwrapExtendedJson(CANONICAL)).toEqual({
      _id: '6af0b563539838117f61b2f9',
      s: '2026-01-01T00:00:00.000Z',
      i: 5,
      l: '9007199254740993',
      name: 'x',
      db: 1.5,
      dc: 2.5,
      o: '507f1f77bcf86cd799439022',
      t: '2026-03-03T00:00:00.000Z',
    })
  })

  it('writes every value back as the type it had when the form value is unchanged', () => {
    const form = unwrapExtendedJson(CANONICAL) as Record<string, unknown>
    delete form._id
    const payload = wrapExtendedJson(form, CANONICAL)

    expect(payload).toEqual({
      s: { $string: '2026-01-01T00:00:00.000Z' },
      i: { $numberInt: '5' },
      l: { $numberLong: '9007199254740993' },
      name: 'x',
      db: { $numberDouble: '1.5' },
      dc: { $numberDecimal: '2.5' },
      o: { $oid: '507f1f77bcf86cd799439022' },
      t: { $date: '2026-03-03T00:00:00.000Z' },
    })
  })

  it('keeps an edited int an int, an edited decimal a decimal and edited text text', () => {
    const payload = wrapExtendedJson({ i: 7, dc: 3.75, db: 2, s: '2026-05-05T00:00:00.000Z' }, CANONICAL)

    expect(payload.i).toEqual({ $numberInt: '7' })
    expect(payload.dc).toEqual({ $numberDecimal: '3.75' })
    expect(payload.db).toEqual({ $numberDouble: '2' })
    expect(payload.s).toEqual({ $string: '2026-05-05T00:00:00.000Z' }) // not turned into a date
  })

  it('sends a number that no longer fits its type plain, and an edited long as a wrapper', () => {
    const payload = wrapExtendedJson({ i: 2.5, l: 42 }, CANONICAL)
    expect(payload.i).toBe(2.5)
    expect(payload.l).toEqual({ $numberLong: '42' })
    expect(wrapExtendedJson({ i: 3_000_000_000 }, CANONICAL).i).toBe(3_000_000_000) // beyond int32: the server picks long
  })

  it('still writes a date-looking string of a NEW field as a date, as the form means it', () => {
    expect(wrapExtendedJson({ fresh: '2026-05-05T00:00:00.000Z' }, CANONICAL).fresh).toEqual({ $date: '2026-05-05T00:00:00.000Z' })
  })

  it('does not treat a wrapper with other keys as a string wrapper', () => {
    expect(unwrapExtendedJson({ $string: 'x', other: 1 })).toEqual({ $string: 'x', other: 1 })
  })
})
