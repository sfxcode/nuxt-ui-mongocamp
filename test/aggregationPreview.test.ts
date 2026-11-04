import { describe, expect, it } from 'vitest'
import { PREVIEW_LIMIT, pipelineKey, previewPipeline } from '../src/runtime/utils/aggregationPreview'
import type { AggregationStage } from '../src/runtime/utils/aggregationPipeline'

const stages: AggregationStage[] = [
  { id: '1', type: '$match', value: { price: { $gte: 10 } } },
  { id: '2', type: '$group', value: { _id: '$grp', n: { $sum: 1 } } },
  { id: '3', type: '$sort', value: { n: -1 } },
]

describe('previewPipeline', () => {
  it('runs the stages up to and including the chosen one, then a small limit', () => {
    expect(previewPipeline(stages, 0)).toEqual([{ stage: '$match', value: { price: { $gte: 10 } } }, { stage: '$limit', value: PREVIEW_LIMIT }])
    expect(previewPipeline(stages, 1).map(s => s.stage)).toEqual(['$match', '$group', '$limit'])
    expect(previewPipeline(stages, 2).map(s => s.stage)).toEqual(['$match', '$group', '$sort', '$limit'])
  })

  it('leaves out stages that have nothing in them yet, as a run does', () => {
    const withEmpty: AggregationStage[] = [{ id: 'a', type: '$match', value: {} }, ...stages.slice(1)]
    expect(previewPipeline(withEmpty, 1).map(s => s.stage)).toEqual(['$group', '$limit'])
    expect(previewPipeline([{ id: 'a', type: '$match', value: {} }], 0)).toEqual([{ stage: '$limit', value: PREVIEW_LIMIT }])
  })

  it('uses the given limit, whole and at least 1, and never changes the stages', () => {
    expect(previewPipeline(stages, 0, 3).at(-1)).toEqual({ stage: '$limit', value: 3 })
    expect(previewPipeline(stages, 0, 0).at(-1)).toEqual({ stage: '$limit', value: 1 })
    expect(previewPipeline(stages, 0, 2.9).at(-1)).toEqual({ stage: '$limit', value: 2 })
    expect(stages).toHaveLength(3)
  })

  it('keeps a limit the user has, and only appends its own after it', () => {
    const limited: AggregationStage[] = [{ id: 'l', type: '$limit', value: 2 }]
    expect(previewPipeline(limited, 0)).toEqual([{ stage: '$limit', value: 2 }, { stage: '$limit', value: PREVIEW_LIMIT }])
  })

  it('gives equal pipelines an equal key', () => {
    expect(pipelineKey(previewPipeline(stages, 1))).toBe(pipelineKey(previewPipeline([...stages], 1)))
    expect(pipelineKey(previewPipeline(stages, 1))).not.toBe(pipelineKey(previewPipeline(stages, 2)))
  })
})
