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
