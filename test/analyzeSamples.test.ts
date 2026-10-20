import { describe, it, expect } from 'vitest'
import { analyzeSamples, kindOf } from '../src/runtime/utils/analyzeSamples'

const byPath = (analysis: ReturnType<typeof analyzeSamples>) => Object.fromEntries(analysis.fields.map(f => [f.path, f]))

describe('kindOf', () => {
  it('names the JSON kinds, with ISO strings as dates and a missing value as null', () => {
    expect(kindOf('x')).toBe('string')
    expect(kindOf('2024-03-01T10:00:00Z')).toBe('date')
    expect(kindOf('2024-03-01')).toBe('date')
    expect(kindOf('not a date 2024')).toBe('string')
    expect(kindOf(3)).toBe('number')
    expect(kindOf(true)).toBe('boolean')
    expect(kindOf(null)).toBe('null')
    expect(kindOf(undefined)).toBe('null')
    expect(kindOf([1])).toBe('array')
    expect(kindOf({ a: 1 })).toBe('object')
  })
})

describe('analyzeSamples', () => {
  it('counts in how many sampled documents each field is present, with its share', () => {
    const analysis = analyzeSamples([{ a: 1, b: 'x' }, { a: 2 }, { a: 3, c: true }, { a: 4 }])

    expect(analysis.sampled).toBe(4)
    const fields = byPath(analysis)
    expect(fields.a).toMatchObject({ present: 4, share: 1 })
    expect(fields.b).toMatchObject({ present: 1, share: 0.25 })
    expect(fields.c).toMatchObject({ present: 1, share: 0.25 })
  })

  it('lists the kinds of value a field holds, most frequent first, counting null as present', () => {
    const analysis = analyzeSamples([{ v: 'a' }, { v: 'b' }, { v: null }, { v: 5 }, { v: 'c' }])

    expect(byPath(analysis).v).toMatchObject({
      present: 5,
      types: [{ type: 'string', count: 3 }, { type: 'null', count: 1 }, { type: 'number', count: 1 }],
    })
  })

  it('tells dates from plain text and null from a missing field', () => {
    const analysis = analyzeSamples([{ d: '2024-01-01T10:00:00Z', s: 'hello', n: null }, { d: '2024-02-01T10:00:00Z', s: 'world' }])
    const fields = byPath(analysis)

    expect(fields.d!.types).toEqual([{ type: 'date', count: 2 }])
    expect(fields.s!.types).toEqual([{ type: 'string', count: 2 }])
    expect(fields.n).toMatchObject({ present: 1, types: [{ type: 'null', count: 1 }] })
  })

  it('descends into nested objects, listing the parent and its children', () => {
    const analysis = analyzeSamples([{ user: { name: 'A', address: { city: 'X' } } }, { user: { name: 'B' } }])
    const fields = byPath(analysis)

    expect(analysis.fields.map(f => f.path)).toEqual(['user', 'user.address', 'user.address.city', 'user.name'])
    expect(fields.user!.types).toEqual([{ type: 'object', count: 2 }])
    expect(fields['user.address']).toMatchObject({ present: 1 })
    expect(fields['user.name']).toMatchObject({ present: 2, share: 1 })
  })

  it('looks into the objects of an array, counting a field once per document however many elements have it', () => {
    const analysis = analyzeSamples([
      { items: [{ sku: 'a' }, { sku: 'b' }, { qty: 1 }] },
      { items: [{ sku: 'c' }] },
      { items: [] },
    ])
    const fields = byPath(analysis)

    expect(fields.items).toMatchObject({ present: 3, types: [{ type: 'array', count: 3 }] })
    expect(fields['items[].sku']).toMatchObject({ present: 2, share: 2 / 3 })
    expect(fields['items[].qty']).toMatchObject({ present: 1 })
  })

  it('does not descend past the depth limit', () => {
    const analysis = analyzeSamples([{ a: { b: { c: { d: 1 } } } }], { maxDepth: 2 })
    expect(analysis.fields.map(f => f.path)).toEqual(['a', 'a.b'])
  })

  it('sorts _id first, then by path with children right after their parent', () => {
    const analysis = analyzeSamples([{ zeta: 1, _id: 'x', alpha: { b: 1, a: 2 }, beta: 1 }])
    expect(analysis.fields.map(f => f.path)).toEqual(['_id', 'alpha', 'alpha.a', 'alpha.b', 'beta', 'zeta'])
  })

  describe('common values', () => {
    it('lists the most frequent values of a field with few distinct ones, as text', () => {
      const rows = [...Array.from({ length: 5 }, () => ({ s: 'A', f: true })), ...Array.from({ length: 3 }, () => ({ s: 'B', f: false })), { s: 'C', f: true }]
      const fields = byPath(analyzeSamples(rows))

      expect(fields.s!.topValues).toEqual([{ value: 'A', count: 5 }, { value: 'B', count: 3 }, { value: 'C', count: 1 }])
      expect(fields.f!.topValues).toEqual([{ value: 'true', count: 6 }, { value: 'false', count: 3 }])
    })

    it('limits the list and breaks ties alphabetically', () => {
      const rows = ['d', 'c', 'b', 'a', 'e', 'f', 'g'].map(s => ({ s }))
      expect(byPath(analyzeSamples(rows, { topValues: 3 })).s!.topValues).toEqual([{ value: 'a', count: 1 }, { value: 'b', count: 1 }, { value: 'c', count: 1 }])
    })

    it('leaves them out for a field with many distinct values — ids and names say nothing', () => {
      const rows = Array.from({ length: 50 }, (_, i) => ({ id: `id${i}`, kind: 'k' }))
      const fields = byPath(analyzeSamples(rows))

      expect(fields.id!.topValues).toBeUndefined()
      expect(fields.kind!.topValues).toEqual([{ value: 'k', count: 50 }])
    })

    it('has none for objects and arrays, and shortens a long value', () => {
      const long = 'x'.repeat(100)
      const fields = byPath(analyzeSamples([{ o: { a: 1 }, l: [1, 2], text: long }]))

      expect(fields.o!.topValues).toBeUndefined()
      expect(fields.l!.topValues).toBeUndefined()
      expect(fields.text!.topValues![0]!.value).toHaveLength(40)
    })

    it('counts a value once per document even when an array repeats it', () => {
      const fields = byPath(analyzeSamples([{ items: [{ c: 'red' }, { c: 'red' }, { c: 'blue' }] }, { items: [{ c: 'red' }] }]))
      expect(fields['items[].c']!.topValues).toEqual([{ value: 'red', count: 2 }, { value: 'blue', count: 1 }])
    })
  })

  describe('edge cases', () => {
    it('handles an empty sample and ignores rows that are not objects', () => {
      expect(analyzeSamples([])).toEqual({ sampled: 0, fields: [], truncated: false })
      const analysis = analyzeSamples([null, 5, 'x', [1], { a: 1 }])
      expect(analysis.sampled).toBe(1)
      expect(analysis.fields.map(f => f.path)).toEqual(['a'])
    })

    it('treats __proto__ and constructor as ordinary field names', () => {
      const row = JSON.parse('{"__proto__":{"x":1},"constructor":2,"toString":3}')
      const analysis = analyzeSamples([row])

      expect(analysis.fields.map(f => f.path)).toEqual(['__proto__', '__proto__.x', 'constructor', 'toString'])
      expect(({} as Record<string, unknown>).x).toBeUndefined()
    })

    it('caps the number of fields and says so', () => {
      const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${String(i).padStart(2, '0')}`, i]))
      const analysis = analyzeSamples([wide], { maxFields: 10 })

      expect(analysis.fields).toHaveLength(10)
      expect(analysis.truncated).toBe(true)
      expect(analyzeSamples([wide]).truncated).toBe(false)
    })

    it('stays correct for a field present in only some documents when others hold other kinds', () => {
      const analysis = analyzeSamples([{ v: 1 }, { v: '1' }, { w: 1 }])
      expect(byPath(analysis).v).toMatchObject({ present: 2, share: 2 / 3 })
    })
  })
})
