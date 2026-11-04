import { describe, expect, it } from 'vitest'
import { MAX_PIPELINE_BYTES, MAX_PIPELINE_STAGES, MAX_SAVED, sanitizePipeline, sanitizePipelineList, upsertPipeline } from '../src/runtime/utils/savedPipelines'
import type { SavedPipelineEntry } from '../src/runtime/utils/savedPipelines'

const good = [{ stage: '$match', value: { a: 1 } }, { stage: '$limit', value: 5 }]

describe('sanitizePipeline', () => {
  it('keeps a valid pipeline as a clean copy', () => {
    const clean = sanitizePipeline([{ stage: '$match', value: { a: 1 }, extra: 1 }])
    expect(clean).toEqual([{ stage: '$match', value: { a: 1 } }])
  })

  it('refuses empty, malformed and oversized input', () => {
    for (const bad of [undefined, 'x', [], {}, [1], [{ stage: 'match', value: 1 }], [{ stage: '$match' }], [{ value: 1 }]]) expect(sanitizePipeline(bad)).toBeUndefined()
    expect(sanitizePipeline(Array.from({ length: MAX_PIPELINE_STAGES + 1 }, () => ({ stage: '$limit', value: 1 })))).toBeUndefined()
    expect(sanitizePipeline([{ stage: '$match', value: { s: 'x'.repeat(MAX_PIPELINE_BYTES) } }])).toBeUndefined()
  })

  it('refuses a denied stage or operator at any depth, so stored data cannot bring one back', () => {
    for (const stage of ['$out', '$merge', '$lookup', '$unionWith', '$graphLookup', '$collStats', '$indexStats']) expect(sanitizePipeline([{ stage, value: 'x' }])).toBeUndefined()
    expect(sanitizePipeline([{ stage: '$addFields', value: { a: { $function: { body: 'x', args: [], lang: 'js' } } } }])).toBeUndefined()
    expect(sanitizePipeline([{ stage: '$facet', value: { a: [{ $lookup: { from: 'x' } }] } }])).toBeUndefined()
    expect(sanitizePipeline([{ stage: '$match', value: { $where: 'true' } }])).toBeUndefined()
  })

  it('accepts a string that merely looks like an operator', () => {
    expect(sanitizePipeline([{ stage: '$match', value: { note: '$out' } }])).toBeDefined()
  })
})

describe('upsertPipeline', () => {
  it('adds, replaces by name ignoring case and trims', () => {
    const a = upsertPipeline([], '  Top  ', good)
    expect(a.ok && a.list).toEqual([{ name: 'Top', pipeline: good }])
    const b = upsertPipeline(a.ok ? a.list : [], 'top', [{ stage: '$limit', value: 1 }])
    expect(b.ok && b.list).toEqual([{ name: 'top', pipeline: [{ stage: '$limit', value: 1 }] }])
  })

  it('refuses a bad name, a bad pipeline and a full list (but still replaces)', () => {
    expect(upsertPipeline([], ' ', good)).toEqual({ ok: false, reason: 'invalid-name' })
    expect(upsertPipeline([], 'n', [])).toEqual({ ok: false, reason: 'invalid-pipeline' })
    expect(upsertPipeline([], 'n', [{ stage: '$out', value: 'x' }])).toEqual({ ok: false, reason: 'invalid-pipeline' })
    const full: SavedPipelineEntry[] = Array.from({ length: MAX_SAVED }, (_, i) => ({ name: `n${i}`, pipeline: good }))
    expect(upsertPipeline(full, 'new', good)).toEqual({ ok: false, reason: 'limit' })
    expect(upsertPipeline(full, 'N0', good).ok).toBe(true)
  })
})

describe('sanitizePipelineList', () => {
  it('drops bad entries, denied pipelines and duplicates', () => {
    const list = sanitizePipelineList([
      { name: 'ok', pipeline: good },
      { name: 'evil', pipeline: [{ stage: '$out', value: 'x' }] },
      { name: '', pipeline: good },
      5,
      { name: 'OK', pipeline: [{ stage: '$limit', value: 2 }] },
    ])
    expect(list).toEqual([{ name: 'OK', pipeline: [{ stage: '$limit', value: 2 }] }])
    expect(sanitizePipelineList('nope')).toEqual([])
  })
})
