import { describe, it, expect } from 'vitest'
import type { SchemaAnalysis } from '@sfxcode/nuxt-mongocamp-server'
import { analysisSampleSize, analysisTimeoutMs, FULL_ANALYSIS_MAX_DOCUMENTS, kindOfServerType, statisticsFromSchemaAnalysis } from '../src/runtime/utils/schemaAnalysis'

// shaped like the real answer of server 1.6.3 for a 5 000-document collection (recorded 2026-11-03)
const type = (fieldType: string, count: number) => ({ fieldType, count, percentageOfParent: 1 })
const recorded: SchemaAnalysis = {
  count: 5000,
  sample: 5000,
  percentageOfAnalysed: 1,
  fields: [
    { name: '_id', fullName: '_id', count: 5000, percentageOfParent: 1, fieldTypes: [type('objectId', 5000)] },
    { name: 'd', fullName: 'd', count: 715, percentageOfParent: 0.143, fieldTypes: [type('double', 715)] },
    {
      name: 'items',
      fullName: 'items',
      count: 2500,
      percentageOfParent: 0.5,
      fieldTypes: [type('array', 2500)],
      subFields: [{
        name: '[array element]',
        fullName: 'items.[]',
        count: 5000,
        percentageOfParent: 2,
        fieldTypes: [type('object', 5000)],
        subFields: [
          { name: 'qty', fullName: 'items.[].qty', count: 5000, percentageOfParent: 1, fieldTypes: [type('long', 5000)] },
          { name: 'sku', fullName: 'items.[].sku', count: 5000, percentageOfParent: 1, fieldTypes: [type('string', 5000)] },
        ],
      }],
    },
    { name: 'mixed', fullName: 'mixed', count: 5000, percentageOfParent: 1, fieldTypes: [type('long', 2500), type('string', 2500)] },
    {
      name: 'nested',
      fullName: 'nested',
      count: 5000,
      percentageOfParent: 1,
      fieldTypes: [type('object', 5000)],
      subFields: [
        { name: 'x', fullName: 'nested.x', count: 5000, percentageOfParent: 1, fieldTypes: [type('long', 5000)] },
        { name: 'y', fullName: 'nested.y', count: 5000, percentageOfParent: 1, fieldTypes: [type('object', 5000)], subFields: [{ name: 'z', fullName: 'nested.y.z', count: 5000, percentageOfParent: 1, fieldTypes: [type('string', 5000)] }] },
      ],
    },
    { name: 'nullable', fullName: 'nullable', count: 5000, percentageOfParent: 1, fieldTypes: [type('null', 1000), type('string', 4000)] },
    { name: 'tags', fullName: 'tags', count: 4000, percentageOfParent: 0.8, fieldTypes: [type('array', 4000)], subFields: [{ name: '[array element]', fullName: 'tags.[]', count: 8000, percentageOfParent: 2, fieldTypes: [type('string', 8000)] }] },
    { name: 'when', fullName: 'when', count: 5000, percentageOfParent: 1, fieldTypes: [type('date', 5000)] },
  ],
}

describe('statisticsFromSchemaAnalysis', () => {
  const result = statisticsFromSchemaAnalysis(recorded)
  const byPath = Object.fromEntries(result.fields.map(f => [f.path, f]))

  it('lists nested fields as a.b and fields inside array elements as items[].sku, without a row for the element node', () => {
    expect(result.fields.map(f => f.path)).toEqual(['_id', 'd', 'items', 'items[].qty', 'items[].sku', 'mixed', 'nested', 'nested.x', 'nested.y', 'nested.y.z', 'nullable', 'tags', 'when'])
  })

  it('reports how many documents were analysed, and no truncation', () => {
    expect(result.sampled).toBe(5000)
    expect(result.truncated).toBe(false)
  })

  it('maps counts to a share of documents and a document count', () => {
    expect(byPath._id).toMatchObject({ present: 5000, share: 1 })
    expect(byPath.d).toMatchObject({ present: 715, share: 0.143 })
    expect(byPath.tags).toMatchObject({ present: 4000, share: 0.8 })
  })

  it('does not inflate a field inside array elements by the number of elements (items in half the documents ⇒ sku in half)', () => {
    expect(byPath.items!.share).toBe(0.5)
    expect(byPath['items[].sku']).toMatchObject({ present: 2500, share: 0.5 })
    expect(byPath['items[].qty']!.share).toBe(0.5)
  })

  it('scales the type split of a field inside array elements from elements to documents', () => {
    expect(byPath['items[].qty']!.types).toEqual([{ type: 'number', count: 2500 }])
    const mixedElements = statisticsFromSchemaAnalysis({
      count: 1000,
      sample: 1000,
      percentageOfAnalysed: 1,
      fields: [{ name: 'a', fullName: 'a', count: 1000, percentageOfParent: 1, fieldTypes: [type('array', 1000)], subFields: [{ name: '[array element]', fullName: 'a.[]', count: 2000, percentageOfParent: 2, fieldTypes: [type('object', 2000)], subFields: [{ name: 'v', fullName: 'a.[].v', count: 2000, percentageOfParent: 1, fieldTypes: [type('long', 1000), type('string', 1000)] }] }] }],
    })

    expect(mixedElements.fields.find(f => f.path === 'a[].v')).toMatchObject({ present: 1000, types: [{ type: 'number', count: 500 }, { type: 'string', count: 500 }] })
  })

  it('maps the server types to kinds, merges types that share a kind, and orders them by count', () => {
    expect(byPath._id!.types).toEqual([{ type: 'string', count: 5000 }])
    expect(byPath.d!.types).toEqual([{ type: 'number', count: 715 }])
    expect(byPath.mixed!.types).toEqual([{ type: 'number', count: 2500 }, { type: 'string', count: 2500 }])
    expect(byPath.nullable!.types).toEqual([{ type: 'string', count: 4000 }, { type: 'null', count: 1000 }])
    expect(byPath.when!.types).toEqual([{ type: 'date', count: 5000 }])
    expect(byPath.nested!.types).toEqual([{ type: 'object', count: 5000 }])
    expect(byPath.tags!.types).toEqual([{ type: 'array', count: 4000 }])
  })

  it('lists no common values — the server gives none', () => {
    expect(result.fields.every(f => f.topValues === undefined)).toBe(true)
  })

  it('merges long and double into one number type', () => {
    const merged = statisticsFromSchemaAnalysis({ count: 10, sample: 10, percentageOfAnalysed: 1, fields: [{ name: 'n', fullName: 'n', count: 10, percentageOfParent: 1, fieldTypes: [type('long', 6), type('double', 3), type('int', 1)] }] })

    expect(merged.fields[0]!.types).toEqual([{ type: 'number', count: 10 }])
  })

  it('multiplies shares down an optional parent: half the documents have the object, a third of those the field', () => {
    const analysis: SchemaAnalysis = {
      count: 600,
      sample: 600,
      percentageOfAnalysed: 1,
      fields: [{ name: 'o', fullName: 'o', count: 300, percentageOfParent: 0.5, fieldTypes: [type('object', 300)], subFields: [{ name: 'f', fullName: 'o.f', count: 100, percentageOfParent: 1 / 3, fieldTypes: [type('string', 100)] }] }],
    }

    expect(statisticsFromSchemaAnalysis(analysis).fields.find(f => f.path === 'o.f')).toMatchObject({ present: 100 })
  })

  it('treats an unknown server type as text, and an empty analysis as no fields', () => {
    expect(kindOfServerType('binData')).toBe('string')
    expect(statisticsFromSchemaAnalysis({ count: 3, sample: 3, percentageOfAnalysed: 1 })).toEqual({ sampled: 3, fields: [], truncated: false })
  })

  it('never reports more analysed documents than the collection has, and falls back to the count when the sample is unset', () => {
    expect(statisticsFromSchemaAnalysis({ count: 100, sample: 500, percentageOfAnalysed: 1, fields: [] }).sampled).toBe(100)
    expect(statisticsFromSchemaAnalysis({ count: 100, sample: -1, percentageOfAnalysed: 0, fields: [] }).sampled).toBe(100)
  })

  it('caps the number of fields and says so', () => {
    const fields = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, fullName: `f${i}`, count: 1, percentageOfParent: 1, fieldTypes: [type('string', 1)] }))

    const capped = statisticsFromSchemaAnalysis({ count: 1, sample: 1, percentageOfAnalysed: 1, fields }, 3)

    expect(capped.fields.map(f => f.path)).toEqual(['f0', 'f1', 'f2'])
    expect(capped.truncated).toBe(true)
  })
})

describe('analysisSampleSize / analysisTimeoutMs', () => {
  it('always asks for a positive explicit size — the server returns no fields for 0 and fails for -1', () => {
    expect(analysisSampleSize(0)).toBe(1)
    expect(analysisSampleSize(-5)).toBe(1)
    expect(analysisSampleSize(Number.NaN)).toBe(1)
    expect(analysisSampleSize(5000)).toBe(5000)
    expect(analysisSampleSize(5000.9)).toBe(5000)
  })

  it('caps the size at the documented maximum', () => {
    expect(analysisSampleSize(10_000_000)).toBe(FULL_ANALYSIS_MAX_DOCUMENTS)
  })

  it('grows the timeout with the number of documents, from a 15 s base to at most 2 minutes', () => {
    expect(analysisTimeoutMs(0)).toBe(15_000)
    expect(analysisTimeoutMs(50_000)).toBe(35_000) // measured: 5.4 s
    expect(analysisTimeoutMs(FULL_ANALYSIS_MAX_DOCUMENTS)).toBe(95_000)
    expect(analysisTimeoutMs(10_000_000)).toBe(120_000)
    expect(analysisTimeoutMs(-1)).toBe(15_000)
  })
})
