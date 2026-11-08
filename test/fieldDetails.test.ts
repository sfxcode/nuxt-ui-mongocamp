import { describe, expect, it } from 'vitest'
import { bsonOfType, columnTypeOf, dominantKindOfField, fieldPathsOf, toFieldTypeInfos, toTypeHints, valueKindOfType } from '../src/runtime/utils/fieldDetails'

// recorded from server 1.8.1 (live spike 2026-11-08)
const DETAILS = [
  { path: '_id', types: [{ type: 'objectId', count: 6 }] },
  { path: 'big', types: [{ type: 'long', count: 1 }] },
  { path: 'age', types: [{ type: 'long', count: 15 }, { type: 'string', count: 5 }] },
  { path: 'score', types: [{ type: 'int', count: 4 }, { type: 'double', count: 3 }, { type: 'null', count: 9 }] },
  { path: 'nested', types: [{ type: 'object', count: 1 }] },
  { path: 'nested.x', types: [{ type: 'objectId', count: 1 }] },
  { path: 'tags', types: [{ type: 'array', count: 1 }] },
  { path: 'tags[]', types: [{ type: 'string', count: 2 }] },
  { path: 'flag', types: [{ type: 'bool', count: 3 }] },
  { path: 'when', types: [{ type: 'date', count: 3 }] },
  { path: 'blob', types: [{ type: 'binData', count: 2 }] },
  { path: 'empty', types: [{ type: 'null', count: 2 }] },
]

describe('valueKindOfType', () => {
  it('maps the MongoDB $type names', () => {
    expect(['string', 'objectId'].map(valueKindOfType)).toEqual(['string', 'string'])
    expect(['int', 'long', 'double', 'decimal'].map(valueKindOfType)).toEqual(['number', 'number', 'number', 'number'])
    expect(['bool', 'date', 'object', 'array', 'null'].map(valueKindOfType)).toEqual(['boolean', 'date', 'object', 'array', 'null'])
    expect(valueKindOfType('binData')).toBeUndefined()
  })
})

describe('dominantKindOfField', () => {
  it('takes the most frequent kind, adding up the numeric types and ignoring null', () => {
    expect(dominantKindOfField(DETAILS, 'age')).toBe('number')
    expect(dominantKindOfField(DETAILS, 'score')).toBe('number') // 4 + 3 beats the 9 nulls, which do not count
    expect(dominantKindOfField(DETAILS, 'flag')).toBe('boolean')
    expect(dominantKindOfField(DETAILS, 'when')).toBe('date')
    expect(dominantKindOfField(DETAILS, '_id')).toBe('string')
    expect(dominantKindOfField(DETAILS, 'nested.x')).toBe('string')
    expect(dominantKindOfField(DETAILS, 'tags')).toBe('array')
  })

  it('is undefined for an unknown field, only nulls or a type without a kind', () => {
    expect(dominantKindOfField(DETAILS, 'ghost')).toBeUndefined()
    expect(dominantKindOfField(DETAILS, 'empty')).toBeUndefined()
    expect(dominantKindOfField(DETAILS, 'blob')).toBeUndefined()
    expect(dominantKindOfField([{ path: 'x' }], 'x')).toBeUndefined()
  })
})

describe('fieldPathsOf', () => {
  it('lists nested paths sorted and leaves out the elements of arrays', () => {
    expect(fieldPathsOf(DETAILS)).toEqual(['_id', 'age', 'big', 'blob', 'empty', 'flag', 'nested', 'nested.x', 'score', 'tags', 'when'])
  })
})

describe('FieldTypeInfo mappings', () => {
  it('maps $type names to BSON types; containers, binary data and the like have none', () => {
    expect(['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'null'].map(bsonOfType)).toEqual(['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'null'])
    for (const type of ['object', 'array', 'binData', 'regex', 'timestamp', 'constructor']) expect(bsonOfType(type)).toBeUndefined()
  })

  it('orders types by frequency, adds counts of one type, ignores null, remembers containers', () => {
    const [info] = toFieldTypeInfos([{ path: 'a', types: [{ type: 'string', count: 1 }, { type: 'long', count: 3 }, { type: 'null', count: 9 }, { type: 'object', count: 2 }, { type: 'long', count: 1 }] }])

    expect(info).toEqual({ path: 'a', types: ['long', 'string'], dominant: 'long', container: 'object', mixed: true, element: false })
  })

  it('column types for bulk edit and import', () => {
    const col = (types: Array<{ type: string, count: number }>) => columnTypeOf(toFieldTypeInfos([{ path: 'x', types }])[0]!)
    expect([col([{ type: 'int', count: 1 }]), col([{ type: 'bool', count: 1 }]), col([{ type: 'date', count: 1 }]), col([{ type: 'string', count: 1 }]), col([{ type: 'array', count: 1 }]), col([])]).toEqual(['number', 'boolean', 'date-time', 'string', 'json', 'string'])
  })

  it('hints skip containers and multi-type paths', () => {
    expect(toTypeHints(toFieldTypeInfos([
      { path: 'a', types: [{ type: 'int', count: 1 }] },
      { path: 'b', types: [{ type: 'int', count: 1 }, { type: 'long', count: 1 }] },
      { path: 'c', types: [{ type: 'object', count: 1 }] },
    ]))).toEqual({ a: 'int' })
  })
})
