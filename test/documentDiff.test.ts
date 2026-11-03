import { describe, it, expect } from 'vitest'
import { buildPartialBody, diffDocument, hasChanges } from '../src/runtime/utils/documentDiff'

const diff = (a: Record<string, unknown>, b: Record<string, unknown>) => diffDocument(a, b)!

describe('diffDocument', () => {
  it('reports nothing for identical documents, and ignores _id', () => {
    const changes = diff({ _id: { $oid: 'a' }, name: 'x', n: 1 }, { _id: 'something else', name: 'x', n: 1 })

    expect(hasChanges(changes)).toBe(false)
  })

  it('sets only the changed top-level fields', () => {
    expect(diff({ name: 'a', n: 1, keep: true }, { name: 'b', n: 1, keep: true })).toEqual({ set: { name: 'b' }, unset: [] })
  })

  it('descends into plain nested objects and sets dotted leaves — a whole nested value would replace the stored one', () => {
    const changes = diff({ nested: { x: 1, y: 2 } }, { nested: { x: 1, y: 3 } })

    expect(changes).toEqual({ set: { 'nested.y': 3 }, unset: [] })
  })

  it('descends several levels and adds new nested fields', () => {
    const changes = diff({ a: { b: { c: 1 } } }, { a: { b: { c: 2, d: 5 } } })

    expect(changes.set).toEqual({ 'a.b.c': 2, 'a.b.d': 5 })
  })

  it('replaces an array as a whole, however little of it changed', () => {
    expect(diff({ tags: [1, 2, 3] }, { tags: [1, 2] })).toEqual({ set: { tags: [1, 2] }, unset: [] })
    expect(diff({ tags: [{ a: 1 }] }, { tags: [{ a: 2 }] }).set).toEqual({ tags: [{ a: 2 }] })
  })

  it('unsets removed fields, nested ones by dotted path, and treats an undefined value as removed', () => {
    const changes = diff({ gone: 1, nested: { x: 1, y: 2 }, cleared: 'x' }, { nested: { x: 1 }, cleared: undefined })

    expect(changes.set).toEqual({})
    expect(changes.unset.sort()).toEqual(['cleared', 'gone', 'nested.y'])
  })

  it('keeps null as a value instead of removing the field', () => {
    expect(diff({ n: 1 }, { n: null })).toEqual({ set: { n: null }, unset: [] })
  })

  it('does not treat a round-tripped extended-JSON value as a change, and never sends it', () => {
    const changes = diff(
      { when: { $date: '2024-01-01T00:00:00.000Z' }, big: { $numberLong: '5' }, ref: { $oid: 'abc' } },
      { when: { $date: '2024-01-01T00:00:00.000Z' }, big: 5, ref: { $oid: 'abc' } },
    )

    expect(hasChanges(changes)).toBe(false)
  })

  it('treats a date as the same whether it came as { $date: ms } or as the ISO string', () => {
    const ms = Date.parse('2024-01-01T00:00:00.000Z')

    expect(hasChanges(diff({ when: { $date: ms } }, { when: { $date: '2024-01-01T00:00:00.000Z' } }))).toBe(false)
  })

  it('treats the same instant as unchanged whether or not the zero milliseconds are written (the server reads `…:00Z`, the form rewraps `…:00.000Z`)', () => {
    expect(hasChanges(diff({ when: '2025-05-05T12:00:00Z' }, { when: { $date: '2025-05-05T12:00:00Z' } }))).toBe(false)
    expect(hasChanges(diff({ when: '2025-05-05T12:00:00Z' }, { when: { $date: '2025-05-05T12:00:00.000Z' } }))).toBe(false)
    expect(hasChanges(diff({ when: '2025-05-05T12:00:00.123Z' }, { when: { $date: '2025-05-05T12:00:00.123Z' } }))).toBe(false)
    expect(hasChanges(diff({ nested: { at: '2025-05-05T12:00:00Z' } }, { nested: { at: '2025-05-05T12:00:00.000Z' } }))).toBe(false)
  })

  it('still sends a date whose instant changed, even by a millisecond', () => {
    expect(diff({ when: '2025-05-05T12:00:00Z' }, { when: { $date: '2025-05-05T12:00:00.001Z' } }).set).toEqual({ when: { $date: '2025-05-05T12:00:00.001Z' } })
  })

  it('does not treat other strings as dates', () => {
    expect(diff({ s: '2025-05-05' }, { s: '2025-05-05T00:00:00Z' }).set).toEqual({ s: '2025-05-05T00:00:00Z' })
    expect(diff({ s: '2025-05-05T00:00:00' }, { s: '2025-05-05T00:00:00Z' }).set).toEqual({ s: '2025-05-05T00:00:00Z' }) // no zone: not comparable
    expect(diff({ s: 'abc' }, { s: 'abd' }).set).toEqual({ s: 'abd' })
  })

  it('sends a changed extended-JSON value whole, never descending into the wrapper', () => {
    const changes = diff({ when: { $date: '2024-01-01T00:00:00.000Z' } }, { when: { $date: '2025-01-01T00:00:00.000Z' } })

    expect(changes.set).toEqual({ when: { $date: '2025-01-01T00:00:00.000Z' } })
  })

  it('compares a Date with an ISO string as equal (what ensureMetaData stamps)', () => {
    expect(hasChanges(diff({ at: '2024-01-01T00:00:00.000Z' }, { at: new Date('2024-01-01T00:00:00.000Z') }))).toBe(false)
  })

  it('sets a whole object when the other side is not an object, or nothing was there', () => {
    expect(diff({ a: 1 }, { a: { b: 2 } }).set).toEqual({ a: { b: 2 } })
    expect(diff({ a: { b: 2 } }, { a: 1 }).set).toEqual({ a: 1 })
    expect(diff({}, { metaData: { createdBy: 'u' } }).set).toEqual({ metaData: { createdBy: 'u' } })
  })

  it('does not descend into objects whose keys cannot be dotted paths — the whole object is set', () => {
    const changes = diff({ weird: { 'a.b': 1 } }, { weird: { 'a.b': 2 } })

    expect(changes.set).toEqual({ weird: { 'a.b': 2 } })
  })

  it('returns null when a top-level field name cannot be addressed in a partial update', () => {
    expect(diffDocument({ 'a.b': 1 }, { 'a.b': 2 })).toBeNull()
    expect(diffDocument({ $x: 1 }, { $x: 2 })).toBeNull()
  })
})

describe('buildPartialBody', () => {
  it('is just the dotted sets when nothing is removed', () => {
    expect(buildPartialBody({ set: { 'nested.y': 3, 'name': 'b' }, unset: [] })).toEqual({ 'nested.y': 3, 'name': 'b' })
  })

  it('adds one $unset next to the sets', () => {
    expect(buildPartialBody({ set: { n: 2 }, unset: ['extra', 'nested.z'] })).toEqual({ n: 2, $unset: { 'extra': '', 'nested.z': '' } })
  })
})
