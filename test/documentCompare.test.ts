import { describe, it, expect } from 'vitest'
import { compareDocuments, compareText } from '../src/runtime/utils/documentCompare'

const status = (r: ReturnType<typeof compareDocuments>) => Object.fromEntries(r.rows.map(x => [x.path, x.status]))

describe('compareDocuments', () => {
  it('marks same, changed, added and removed paths', () => {
    const r = compareDocuments({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, d: 4 })
    expect(status(r)).toEqual({ a: 'same', b: 'changed', c: 'removed', d: 'added' })
    expect(r.counts).toEqual({ same: 1, changed: 1, added: 1, removed: 1 })
  })

  it('compares nested objects and arrays by path and index', () => {
    const r = compareDocuments({ n: { x: 1, y: [1, 2] } }, { n: { x: 1, y: [1, 3, 4] } })
    expect(status(r)).toEqual({ 'n.x': 'same', 'n.y.0': 'same', 'n.y.1': 'changed', 'n.y.2': 'added' })
  })

  it('ignores key order', () => {
    expect(compareDocuments({ a: 1, b: 2 }, { b: 2, a: 1 }).counts.same).toBe(2)
  })

  it('compares extended-JSON wrappers as the plain values', () => {
    const r = compareDocuments({ _id: { $oid: 'a'.repeat(24) }, at: { $date: '2025-01-01T00:00:00Z' } }, { _id: 'a'.repeat(24), at: '2025-01-01T00:00:00.000Z' })
    expect(r.rows.every(x => x.status === 'same')).toBe(true)
  })

  it('treats the same instant written differently as equal', () => {
    expect(compareDocuments({ at: '2025-01-01T01:00:00+01:00' }, { at: '2025-01-01T00:00:00Z' }).counts.same).toBe(1)
  })

  it('flags a different type with the same text', () => {
    const [row] = compareDocuments({ n: 1 }, { n: '1' }).rows
    expect(row).toMatchObject({ status: 'changed', typeDiffers: true, leftType: 'number', rightType: 'string' })
  })

  it('treats two empty containers as equal and reports a null against a missing path', () => {
    expect(compareDocuments({ a: [], o: {} }, { a: [], o: {} }).counts.same).toBe(2)
    expect(status(compareDocuments({ a: null }, {}))).toEqual({ a: 'removed' })
  })

  it('reports truncation', () => {
    expect(compareDocuments({ a: 1, b: 2, c: 3 }, { a: 1 }, { maxEntries: 2 }).truncated).toBe(true)
  })
})

describe('compareText', () => {
  it('writes leaves as short text', () => {
    expect(compareText(null)).toBe('null')
    expect(compareText('x')).toBe('x')
    expect(compareText([])).toBe('[]')
    expect(compareText(5)).toBe('5')
  })
})
