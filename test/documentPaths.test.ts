import { describe, expect, it } from 'vitest'
import { flattenDocument, getPath, hasPath, joinPath, setPath, splitPath, typeOf } from '../src/runtime/utils/documentPaths'

describe('typeOf', () => {
  it('recognises scalars, containers and extended-JSON wrappers', () => {
    expect(typeOf(null)).toBe('null')
    expect(typeOf('a')).toBe('string')
    expect(typeOf(true)).toBe('boolean')
    expect(typeOf(1.5)).toBe('number')
    expect(typeOf(10n)).toBe('long')
    expect(typeOf(new Date())).toBe('date')
    expect(typeOf([])).toBe('array')
    expect(typeOf({})).toBe('object')
    expect(typeOf({ $oid: 'a'.repeat(24) })).toBe('objectId')
    expect(typeOf({ $date: '2025-01-01T00:00:00Z' })).toBe('date')
    expect(typeOf({ $numberLong: '9007199254740993' })).toBe('long')
    expect(typeOf({ $numberInt: '3' })).toBe('int')
    expect(typeOf({ $numberDouble: '1.5' })).toBe('double')
    expect(typeOf({ $numberDecimal: '1.50' })).toBe('decimal')
  })

  it('treats a wrapper-like object with more keys as an ordinary object', () => {
    expect(typeOf({ $oid: 'x', other: 1 })).toBe('object')
    expect(typeOf({ $unknown: 1 })).toBe('object')
  })
})

describe('typed (canonical) documents', () => {
  it('does not guess: ids and timestamps in plain text are strings, the wrappers carry the types', () => {
    expect(typeOf('a'.repeat(24))).toBe('string')
    expect(typeOf('2026-01-01T00:00:00.000Z')).toBe('string')
    expect(typeOf({ $string: '2026-01-01T00:00:00.000Z' })).toBe('string')
  })

  it('types a canonical read from the server (recorded on 1.8.1): int, long, double, decimal, date, id, text', () => {
    const doc = {
      _id: { $oid: '6af0b563539838117f61b2f9' },
      i: { $numberInt: '5' },
      l: { $numberLong: '9007199254740993' },
      db: { $numberDouble: '1.5' },
      dc: { $numberDecimal: '2.50' },
      t: { $date: { $numberLong: '1772496000000' } },
      s: { $string: '2026-01-01T00:00:00.000Z' },
      name: 'x',
    }
    expect(flattenDocument(doc).entries.map(e => [e.path, e.type])).toEqual([
      ['_id', 'objectId'], ['i', 'int'], ['l', 'long'], ['db', 'double'], ['dc', 'decimal'], ['t', 'date'], ['s', 'string'], ['name', 'string'],
    ])
  })
})

describe('splitPath / joinPath', () => {
  it('round-trips keys with dots and backslashes', () => {
    for (const segments of [['a'], ['a', 'b'], ['a.b', 'c'], ['a\\b', 'c.d'], ['', 'x'], ['0', '1']]) {
      expect(splitPath(joinPath(segments))).toEqual(segments)
    }
    expect(joinPath(['a.b', 'c'])).toBe('a\\.b.c')
    expect(splitPath('')).toEqual([])
  })
})

describe('flattenDocument', () => {
  it('lists nested leaves and array elements by index', () => {
    const { entries, truncated } = flattenDocument({ name: 'A', address: { city: 'X', geo: { lat: 1 } }, tags: ['a', 'b'], items: [{ price: 2 }] })
    expect(truncated).toBe(false)
    expect(entries.map(e => [e.path, e.type, e.value])).toEqual([
      ['name', 'string', 'A'],
      ['address.city', 'string', 'X'],
      ['address.geo.lat', 'number', 1],
      ['tags.0', 'string', 'a'],
      ['tags.1', 'string', 'b'],
      ['items.0.price', 'number', 2],
    ])
  })

  it('keeps a wrapper as one leaf and an empty container as a leaf', () => {
    const { entries } = flattenDocument({ _id: { $oid: 'a'.repeat(24) }, at: { $date: '2025-01-01T00:00:00Z' }, big: { $numberLong: '9007199254740993' }, e: {}, l: [], n: null })
    expect(entries.map(e => [e.path, e.type])).toEqual([['_id', 'objectId'], ['at', 'date'], ['big', 'long'], ['e', 'object'], ['l', 'array'], ['n', 'null']])
    expect(entries[2]!.value).toEqual({ $numberLong: '9007199254740993' })
  })

  it('escapes keys with dots so paths stay addressable', () => {
    const { entries } = flattenDocument({ 'a.b': { c: 1 } })
    expect(entries[0]!.path).toBe('a\\.b.c')
    expect(getPath({ 'a.b': { c: 1 } }, entries[0]!.path)).toBe(1)
  })

  it('reports an empty or scalar root under the empty path', () => {
    expect(flattenDocument({}).entries).toEqual([{ path: '', type: 'object', value: {} }])
    expect(flattenDocument(5).entries).toEqual([{ path: '', type: 'number', value: 5 }])
  })

  it('stops at the depth and entry limits', () => {
    const deep = flattenDocument({ a: { b: { c: 1 } } }, { maxDepth: 2 })
    expect(deep.entries).toEqual([{ path: 'a.b', type: 'object', value: { c: 1 } }])
    const many = flattenDocument({ list: Array.from({ length: 10 }, (_, i) => i) }, { maxEntries: 3 })
    expect(many.entries).toHaveLength(3)
    expect(many.truncated).toBe(true)
  })

  it('does not change the document and survives a very deep one with the default depth', () => {
    const doc = { a: { b: [1, { c: 2 }] } }
    const copy = JSON.parse(JSON.stringify(doc))
    flattenDocument(doc)
    expect(doc).toEqual(copy)
    let nested: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 5000; i++) nested = { n: nested }
    expect(() => flattenDocument(nested)).not.toThrow()
  })
})

describe('getPath / hasPath', () => {
  const doc = { a: { b: [10, { c: 'x' }] }, n: null, z: undefined }

  it('reads nested values and array elements', () => {
    expect(getPath(doc, 'a.b.0')).toBe(10)
    expect(getPath(doc, 'a.b.1.c')).toBe('x')
    expect(getPath(doc, 'a')).toBe(doc.a)
  })

  it('returns undefined for anything missing, and tells null from missing with hasPath', () => {
    expect(getPath(doc, 'a.x')).toBeUndefined()
    expect(getPath(doc, 'a.b.5')).toBeUndefined()
    expect(getPath(doc, 'a.b.01')).toBeUndefined()
    expect(getPath(doc, 'a.b.length')).toBeUndefined()
    expect(getPath(doc, 'n.x')).toBeUndefined()
    expect(hasPath(doc, 'n')).toBe(true)
    expect(hasPath(doc, 'nope')).toBe(false)
  })

  it('never reads inherited properties', () => {
    expect(getPath({}, 'toString')).toBeUndefined()
    expect(getPath({}, '__proto__')).toBeUndefined()
    expect(getPath({ a: {} }, 'a.constructor')).toBeUndefined()
  })
})

describe('setPath', () => {
  it('returns a copy and shares what it did not touch', () => {
    const doc = { a: { b: 1, c: { d: 2 } }, list: [1, 2] }
    const next = setPath(doc, 'a.b', 9)
    expect(next).toEqual({ a: { b: 9, c: { d: 2 } }, list: [1, 2] })
    expect(doc.a.b).toBe(1)
    expect(next.a.c).toBe(doc.a.c)
    expect(next.list).toBe(doc.list)
  })

  it('creates missing objects, sets array elements and appends at the end', () => {
    expect(setPath({}, 'a.b.c', 1)).toEqual({ a: { b: { c: 1 } } })
    expect(setPath({ l: [1, 2] }, 'l.1', 9)).toEqual({ l: [1, 9] })
    expect(setPath({ l: [1, 2] }, 'l.2', 3)).toEqual({ l: [1, 2, 3] })
    expect(setPath({ l: [{ a: 1 }] }, 'l.0.a', 2)).toEqual({ l: [{ a: 2 }] })
  })

  it('handles escaped keys', () => {
    expect(setPath({}, 'a\\.b', 1)).toEqual({ 'a.b': 1 })
  })

  it('refuses prototype paths, a bad array segment and a gap in an array', () => {
    expect(() => setPath({}, '__proto__.polluted', 1)).toThrow(TypeError)
    expect(() => setPath({}, 'a.constructor.prototype.x', 1)).toThrow(TypeError)
    expect(() => setPath({ l: [] }, 'l.x', 1)).toThrow(TypeError)
    expect(() => setPath({ l: [1] }, 'l.5', 1)).toThrow(RangeError)
    expect(() => setPath({}, '', 1)).toThrow(TypeError)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('replaces a scalar in the way with an object', () => {
    expect(setPath({ a: 5 }, 'a.b', 1)).toEqual({ a: { b: 1 } })
  })
})
