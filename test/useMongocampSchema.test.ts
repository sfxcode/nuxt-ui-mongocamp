import { describe, it, expect } from 'vitest'
import { useMongocampSchema } from '../src/runtime/composables/useMongocampSchema'
import type { ColumnDefinition } from '../src/runtime/composables/useMongocampSchema'

const { schemaFromSamples, schemaToTsInterface } = useMongocampSchema()

function columnType(records: Array<Record<string, unknown>>, key: string): string | undefined {
  return schemaFromSamples(records).find(col => col.columnKey === key)?.columnType
}

function column(records: Array<Record<string, unknown>>, key: string): ColumnDefinition | undefined {
  return schemaFromSamples(records).find(col => col.columnKey === key)
}

describe('schemaFromSamples — date-time string detection', () => {
  it('detects a plain ISO date (no time)', () => {
    expect(columnType([{ createdAt: '2024-01-15' }], 'createdAt')).toBe('date-time')
  })

  it('detects an ISO date-time with Z', () => {
    expect(columnType([{ createdAt: '2024-01-15T10:30:00Z' }], 'createdAt')).toBe('date-time')
  })

  it('detects an ISO date-time with milliseconds and Z', () => {
    expect(columnType([{ createdAt: '2024-01-15T10:30:00.123Z' }], 'createdAt')).toBe('date-time')
  })

  it('detects an ISO date-time with a timezone offset', () => {
    expect(columnType([{ createdAt: '2024-01-15T10:30:00+02:00' }], 'createdAt')).toBe('date-time')
    expect(columnType([{ createdAt: '2024-01-15T10:30:00+0200' }], 'createdAt')).toBe('date-time')
  })

  it('detects an ISO date-time without seconds', () => {
    expect(columnType([{ createdAt: '2024-01-15T10:30' }], 'createdAt')).toBe('date-time')
  })

  it('detects a space-separated date-time', () => {
    expect(columnType([{ createdAt: '2024-01-15 10:30:00' }], 'createdAt')).toBe('date-time')
  })

  it('does not misdetect a plain string', () => {
    expect(columnType([{ name: 'Alice' }], 'name')).toBe('string')
  })

  it('does not misdetect a non-ISO-shaped string', () => {
    expect(columnType([{ code: '01/15/2024' }], 'code')).toBe('string')
  })
})

describe('schemaFromSamples — other value types', () => {
  it('detects a MongoDB extended-JSON $date as date-time', () => {
    expect(columnType([{ createdAt: { $date: '2024-01-15T10:30:00Z' } }], 'createdAt')).toBe('date-time')
  })

  it('detects a MongoDB extended-JSON $oid as string', () => {
    expect(columnType([{ _id: { $oid: '507f1f77bcf86cd799439011' } }], '_id')).toBe('string')
  })

  it('detects extended-JSON numeric wrappers as number', () => {
    expect(columnType([{ count: { $numberLong: '42' } }], 'count')).toBe('number')
  })

  it('detects plain numbers, booleans, arrays and objects', () => {
    const record = { qty: 3, active: true, tags: ['a', 'b'], address: { city: 'X' } }
    expect(columnType([record], 'qty')).toBe('number')
    expect(columnType([record], 'active')).toBe('boolean')
    expect(columnType([record], 'tags')).toBe('array')
    expect(columnType([record], 'address')).toBe('object')
  })

  it('falls back to string when a field has mixed types across samples', () => {
    expect(columnType([{ value: 1 }, { value: 'two' }], 'value')).toBe('string')
  })

  it('ignores null/undefined values when inferring type', () => {
    expect(columnType([{ value: null }, { value: 42 }], 'value')).toBe('number')
  })
})

describe('schemaFromSamples — field ordering and required flag', () => {
  it('orders _id first, fields alphabetically, metaData last', () => {
    const records = [{ metaData: {}, name: 'a', _id: '1', age: 1 }]
    const keys = schemaFromSamples(records).map(col => col.columnKey)
    expect(keys).toEqual(['_id', 'age', 'name', 'metaData'])
  })

  it('marks a field required only when present in every sample', () => {
    const records = [{ a: 1, b: 1 }, { a: 2 }]
    const cols = schemaFromSamples(records)
    expect(cols.find(c => c.columnKey === 'a')?.required).toBe(true)
    expect(cols.find(c => c.columnKey === 'b')?.required).toBe(false)
  })

  it('treats a null value as missing, not present, for the required flag', () => {
    const records = [{ a: 1 }, { a: null }]
    const cols = schemaFromSamples(records)
    expect(cols.find(c => c.columnKey === 'a')?.required).toBe(false)
  })

  it('still lists a field that is null in every sample, but not required', () => {
    const records = [{ a: null }, { a: null }]
    const cols = schemaFromSamples(records)
    const col = cols.find(c => c.columnKey === 'a')
    expect(col).toBeDefined()
    expect(col?.required).toBe(false)
  })
})

describe('schemaFromSamples — array element type inference', () => {
  it('infers a homogeneous array of strings', () => {
    const col = column([{ tags: ['a', 'b'] }], 'tags')
    expect(col?.arrayItemType).toBe('string')
  })

  it('infers a homogeneous array of numbers', () => {
    const col = column([{ scores: [1, 2, 3] }], 'scores')
    expect(col?.arrayItemType).toBe('number')
  })

  it('falls back to string for a mixed-type array', () => {
    const col = column([{ values: [1, 'two', 3] }], 'values')
    expect(col?.arrayItemType).toBe('string')
  })

  it('reports unknown for an array that is always empty across samples', () => {
    const col = column([{ tags: [] }, { tags: [] }], 'tags')
    expect(col?.arrayItemType).toBe('unknown')
  })

  it('combines element types across multiple sampled arrays for the same field', () => {
    const col = column([{ tags: ['a'] }, { tags: [1] }], 'tags')
    expect(col?.arrayItemType).toBe('string')
  })
})

describe('schemaFromSamples — nested object fields', () => {
  it('infers children for a nested object', () => {
    const col = column([{ address: { city: 'X', zip: 12345 } }], 'address')
    expect(col?.columnType).toBe('object')
    expect(col?.children?.map(c => [c.columnKey, c.columnType])).toEqual(
      expect.arrayContaining([['city', 'string'], ['zip', 'number']]),
    )
  })

  it('merges nested object shape across multiple samples', () => {
    const records = [{ address: { city: 'X' } }, { address: { city: 'Y', zip: 1 } }]
    const col = column(records, 'address')
    const zip = col?.children?.find(c => c.columnKey === 'zip')
    expect(zip?.required).toBe(false)
  })

  it('recurses into deeply nested objects', () => {
    const col = column([{ meta: { author: { name: 'Alice' } } }], 'meta')
    const author = col?.children?.find(c => c.columnKey === 'author')
    expect(author?.columnType).toBe('object')
    expect(author?.children?.map(c => c.columnKey)).toEqual(['name'])
  })
})

describe('schemaFromSamples — arrays of objects', () => {
  it('infers children from array-of-object items merged across the sample', () => {
    const records = [{ items: [{ productId: 1, qty: 2 }, { productId: 2, qty: 3, note: 'x' }] }]
    const col = column(records, 'items')
    expect(col?.arrayItemType).toBe('object')
    const keys = col?.children?.map(c => c.columnKey)
    expect(keys).toEqual(expect.arrayContaining(['productId', 'qty', 'note']))
    expect(col?.children?.find(c => c.columnKey === 'note')?.required).toBe(false)
  })
})

describe('schemaToTsInterface', () => {
  it('generates a flat interface with optional fields marked with ?', () => {
    const cols = schemaFromSamples([{ id: 1, name: 'Alice' }, { id: 2 }])
    const result = schemaToTsInterface(cols, 'customer')
    expect(result).toBe('interface Customer {\n  id: number\n  name?: string\n}')
  })

  it('quotes field names that are not valid identifiers', () => {
    const cols = schemaFromSamples([{ 'first-name': 'Alice' }])
    const result = schemaToTsInterface(cols, 'customer')
    expect(result).toContain('\'first-name\': string')
  })

  it('generates a nested interface for an object field and references it by name', () => {
    const cols = schemaFromSamples([{ address: { city: 'X' } }, { address: undefined }])
    const result = schemaToTsInterface(cols, 'customer')
    expect(result).toContain('address?: CustomerAddress')
    expect(result).toContain('interface CustomerAddress {\n  city: string\n}')
  })

  it('generates a singularized nested interface for an array of objects', () => {
    const cols = schemaFromSamples([{ items: [{ productId: 1 }] }])
    const result = schemaToTsInterface(cols, 'cart')
    expect(result).toContain('items: CartItem[]')
    expect(result).toContain('interface CartItem {\n  productId: number\n}')
  })

  it('renders a primitive array element type', () => {
    const cols = schemaFromSamples([{ tags: ['a', 'b'] }])
    const result = schemaToTsInterface(cols, 'cart')
    expect(result).toContain('tags: string[]')
  })

  it('falls back to Record<string, unknown> for an object with no observed fields', () => {
    const cols = schemaFromSamples([{ meta: {} }])
    const result = schemaToTsInterface(cols, 'cart')
    expect(result).toContain('meta: Record<string, unknown>')
  })

  it('falls back to unknown[] for an array that is always empty', () => {
    const cols = schemaFromSamples([{ tags: [] }])
    const result = schemaToTsInterface(cols, 'cart')
    expect(result).toContain('tags: unknown[]')
  })
})
