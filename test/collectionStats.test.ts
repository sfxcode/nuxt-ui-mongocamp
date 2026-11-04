import { describe, expect, it } from 'vitest'
import { mapIndexUsage, mapStorage, toCount } from '../src/runtime/utils/collectionStats'

describe('toCount', () => {
  it('accepts non-negative finite numbers and digit strings, else 0', () => {
    expect(toCount(5)).toBe(5)
    expect(toCount('42')).toBe(42)
    for (const v of [-1, Number.NaN, Infinity, 'x', null, undefined, {}]) expect(toCount(v)).toBe(0)
  })
})

describe('mapStorage', () => {
  it('maps the collection information and drops the namespace', () => {
    const status = { ns: 'mydb.orders', collectionType: 'collection', scaleFactor: 1, size: 1000, count: 10, storageSize: 4096, avgObjSize: 100, nindexes: 2, indexSizes: { _id_: 4096, name_1: 8192 }, totalIndexSize: 12288, ok: 1 }
    const mapped = mapStorage(status as never)
    expect(mapped).toEqual({ collectionType: 'collection', count: 10, size: 1000, storageSize: 4096, avgObjSize: 100, indexCount: 2, indexSizes: { _id_: 4096, name_1: 8192 }, totalIndexSize: 12288 })
    expect(JSON.stringify(mapped)).not.toContain('mydb')
  })

  it('is zero, not NaN, for a missing or malformed field', () => {
    expect(mapStorage({})).toEqual({ collectionType: '', count: 0, size: 0, storageSize: 0, avgObjSize: 0, indexCount: 0, indexSizes: {}, totalIndexSize: 0 })
    expect(mapStorage({ count: 'many' as never, indexSizes: { a: -3 } as never }).indexSizes).toEqual({ a: 0 })
  })
})

describe('mapIndexUsage', () => {
  it('maps name, key, ops and since, flags unused indexes and drops the spec', () => {
    const rows = [
      { name: '_id_', key: { _id: 1 }, spec: { v: 2 }, accesses: { ops: 12, since: '2026-11-01T10:00:00.000Z' } },
      { name: 'name_1', key: { name: 1 }, accesses: { ops: 0, since: '2026-11-01T10:00:00.000Z' } },
    ]
    const out = mapIndexUsage(rows)
    expect(out).toEqual([
      { name: '_id_', key: { _id: 1 }, ops: 12, since: '2026-11-01T10:00:00.000Z', unused: false },
      { name: 'name_1', key: { name: 1 }, ops: 0, since: '2026-11-01T10:00:00.000Z', unused: true },
    ])
    expect(JSON.stringify(out)).not.toContain('spec')
  })

  it('copes with a Date, a digit-string count and rows that are incomplete', () => {
    const out = mapIndexUsage([
      { name: 'a', key: { a: 1 }, accesses: { ops: '9007199254740993', since: new Date('2026-01-01T00:00:00Z') } },
      { name: 'b' },
      { key: { c: 1 } },
      { name: '' },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ since: '2026-01-01T00:00:00.000Z', unused: false })
    expect(out[1]).toEqual({ name: 'b', key: {}, ops: 0, since: null, unused: true })
  })
})
