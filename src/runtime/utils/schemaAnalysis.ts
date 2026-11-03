import type { SchemaAnalysis, SchemaAnalysisField } from '@sfxcode/nuxt-mongocamp-server'
import { comparePaths } from './analyzeSamples'
import type { FieldStatistic, SampleAnalysis, ValueKind } from './analyzeSamples'

// The server's own field analysis (`GET …/schema/analysis`) in the shape of the client-side one, so the same table can
// show either. Verified on server 1.6.3 (2026-11-03, 5 000 and 50 000 documents, brain/project/mongocamp-server-1-6-3-caveat-recheck.md):
// counts and type splits are exact for nested objects, arrays of objects, mixed types, nulls and sparse fields; it
// scans about 10 000 documents per second (50 000 in 5.4 s); `sampleSize=0` ("all") returns no fields at all and
// `-1` is a 500 — so the caller always passes an explicit size; the server gives no common values.

/** More documents than this are never analysed in one request (≈ 20 s on the dev server); use a sample instead. */
export const FULL_ANALYSIS_MAX_DOCUMENTS = 200_000

const BASE_TIMEOUT_MS = 15_000
const MS_PER_DOCUMENT = 0.4
const MAX_TIMEOUT_MS = 120_000

/** Time to wait for an analysis of `documents` documents: a fixed allowance plus 0.4 ms each (measured: 0.11 ms), at most 2 minutes. */
export function analysisTimeoutMs(documents: number): number {
  return Math.min(MAX_TIMEOUT_MS, Math.round(BASE_TIMEOUT_MS + Math.max(0, documents) * MS_PER_DOCUMENT))
}

/** What to ask for: the server needs a positive size, and more than the collection holds is the same as all of it. */
export function analysisSampleSize(documents: number): number {
  return Math.min(FULL_ANALYSIS_MAX_DOCUMENTS, Math.max(1, Math.floor(documents) || 1))
}

// the type names the server reports (`objectId, long, date, bool, string, object, double, array, null`, plus the
// other BSON numbers) as the kinds the statistics table knows
const KIND_BY_SERVER_TYPE: Record<string, ValueKind> = {
  objectId: 'string',
  string: 'string',
  int: 'number',
  long: 'number',
  double: 'number',
  decimal: 'number',
  bool: 'boolean',
  date: 'date',
  object: 'object',
  array: 'array',
  null: 'null',
}

const ARRAY_ELEMENT = '[array element]'
const DEFAULT_MAX_FIELDS = 200

export function kindOfServerType(serverType: string): ValueKind {
  return KIND_BY_SERVER_TYPE[serverType] ?? 'string'
}

/**
 * Maps the server's analysis onto `SampleAnalysis`. Fields inside objects are `a.b`, fields of objects inside arrays
 * `items[].sku` (the server's `[array element]` node is folded into the path, like the client-side analysis does).
 * `share` is the share of analysed documents that have the field: a field's `percentageOfParent` multiplied down the
 * chain, so a field inside array elements is not inflated by the number of elements. The server lists no common values.
 */
export function statisticsFromSchemaAnalysis(analysis: SchemaAnalysis, maxFields = DEFAULT_MAX_FIELDS): SampleAnalysis {
  const sampled = analysis.sample > 0 ? Math.min(analysis.sample, analysis.count || analysis.sample) : analysis.count
  const fields: FieldStatistic[] = []

  const visit = (field: SchemaAnalysisField, parentPath: string, parentShare: number) => {
    const isElement = field.name === ARRAY_ELEMENT
    const path = isElement ? `${parentPath}[]` : (parentPath ? `${parentPath}.${field.name}` : field.name)
    const share = parentShare * Math.min(1, Math.max(0, field.percentageOfParent))
    if (!isElement) {
      const present = Math.round(share * sampled)
      // inside array elements the server counts elements, not documents; scale the type split to documents so that
      // "type count / present" stays a share (a field of 2 000 elements in 1 000 documents has 2 000 / 1 000 otherwise)
      const toDocuments = field.count > 0 ? present / field.count : 1
      const counts = new Map<ValueKind, number>()
      for (const { fieldType, count } of field.fieldTypes ?? []) {
        const kind = kindOfServerType(fieldType)
        counts.set(kind, (counts.get(kind) ?? 0) + Math.round(count * toDocuments))
      }
      fields.push({
        path,
        present,
        share,
        types: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      })
    }
    for (const sub of field.subFields ?? []) visit(sub, path, isElement ? parentShare : share)
  }
  for (const field of analysis.fields ?? []) visit(field, '', 1)

  fields.sort((a, b) => comparePaths(a.path, b.path))
  return { sampled, fields: fields.slice(0, maxFields), truncated: fields.length > maxFields }
}
