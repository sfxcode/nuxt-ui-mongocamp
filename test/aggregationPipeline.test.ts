import { describe, it, expect } from 'vitest'
import {
  FORBIDDEN_OPERATORS,
  buildPipeline,
  findForbidden,
  parsePipeline,
  pipelineToText,
  toVisualStages,
  validateStages,
} from '../src/runtime/utils/aggregationPipeline'
import type { AggregationStage, RequestStage } from '../src/runtime/utils/aggregationPipeline'

const stage = (type: AggregationStage['type'], value: unknown, id = 'x'): AggregationStage => ({ id, type, value })

describe('buildPipeline', () => {
  it('turns stages into { stage, value } with the value as raw JSON, in order', () => {
    expect(buildPipeline([
      stage('$match', { grp: 'A' }),
      stage('$group', { _id: '$grp', n: { $sum: 1 } }),
      stage('$sort', { n: -1 }),
      stage('$limit', 3),
    ])).toEqual([
      { stage: '$match', value: { grp: 'A' } },
      { stage: '$group', value: { _id: '$grp', n: { $sum: 1 } } },
      { stage: '$sort', value: { n: -1 } },
      { stage: '$limit', value: 3 },
    ])
  })

  it('leaves out stages with nothing in them yet instead of sending an empty $project/$sort', () => {
    expect(buildPipeline([stage('$match', {}), stage('$project', undefined), stage('$sort', null), stage('$limit', ''), stage('$group', { _id: null })]))
      .toEqual([{ stage: '$group', value: { _id: null } }])
  })

  it('keeps $limit a number: a typed "10" becomes 10, other stages are untouched', () => {
    expect(buildPipeline([stage('$limit', '10'), stage('$limit', ' 7 '), stage('$match', { n: '10' })])).toEqual([
      { stage: '$limit', value: 10 },
      { stage: '$limit', value: 7 },
      { stage: '$match', value: { n: '10' } },
    ])
  })

  it('does not mutate its input', () => {
    const stages = [stage('$limit', '5')]
    buildPipeline(stages)
    expect(stages[0]!.value).toBe('5')
  })
})

describe('validateStages', () => {
  it('accepts a sensible pipeline and ignores empty stages', () => {
    expect(validateStages([stage('$match', {}), stage('$group', { _id: '$g' }), stage('$sort', { a: 1, b: -1 }), stage('$limit', 5)])).toEqual([])
  })

  it('flags a $limit that is not a positive integer', () => {
    const issues = validateStages([stage('$limit', 0), stage('$limit', 2.5), stage('$limit', 'abc'), stage('$limit', -1), stage('$limit', '4')])
    expect(issues).toEqual([0, 1, 2, 3].map(stageIndex => ({ stageIndex, code: 'invalid-limit' })))
  })

  it('flags a $group without _id, a $sort that is not 1/-1, and a stage value that is not an object', () => {
    expect(validateStages([stage('$group', { n: { $sum: 1 } })])).toEqual([{ stageIndex: 0, code: 'group-needs-id' }])
    expect(validateStages([stage('$sort', { a: 2 })])).toEqual([{ stageIndex: 0, code: 'invalid-sort' }])
    expect(validateStages([stage('$match', 'text'), stage('$project', [1])])).toEqual([
      { stageIndex: 0, code: 'not-object' },
      { stageIndex: 1, code: 'not-object' },
    ])
  })
})

describe('findForbidden', () => {
  it.each(FORBIDDEN_OPERATORS)('refuses %s as a stage name', (operator) => {
    expect(findForbidden([{ stage: operator, value: 'x' }])).toEqual([{ stageIndex: 0, operator, path: operator }])
  })

  it.each(FORBIDDEN_OPERATORS)('refuses %s as an operator key nested in a stage value', (operator) => {
    const found = findForbidden([{ stage: '$addFields', value: { x: { [operator]: { body: 'function(){return 1}' } } } }])
    expect(found).toEqual([{ stageIndex: 0, operator, path: `$addFields.x.${operator}` }])
  })

  it('finds them inside arrays, $expr and $facet sub-pipelines, and reports the stage index', () => {
    const pipeline: RequestStage[] = [
      { stage: '$match', value: { n: 1 } },
      { stage: '$match', value: { $expr: { $and: [{ $eq: [1, 1] }, { $function: { body: 'x', args: [], lang: 'js' } }] } } },
      { stage: '$facet', value: { a: [{ $limit: 1 }, { $lookup: { from: 'secret', localField: 'a', foreignField: 'b', as: 'c' } }] } },
    ]
    expect(findForbidden(pipeline)).toEqual([
      { stageIndex: 1, operator: '$function', path: '$match.$expr.$and[1].$function' },
      { stageIndex: 2, operator: '$lookup', path: '$facet.a[1].$lookup' },
    ])
  })

  it('only looks at keys: a string value, a field path or a field name is just data', () => {
    expect(findForbidden([
      { stage: '$match', value: { name: '$out', note: '$function' } },
      { stage: '$group', value: { _id: '$where', lookup: { $sum: 1 } } },
      { stage: '$project', value: { merge: 1, out: 1 } },
    ])).toEqual([])
  })

  it('is case sensitive like MongoDB and does not trip over inherited property names', () => {
    expect(findForbidden([{ stage: '$match', value: { $OUT: 1, constructor: 1, __proto__: 1, toString: 1 } }])).toEqual([])
  })

  it('reports a value nested deeper than it will follow instead of recursing forever', () => {
    let deep: unknown = { $function: 1 }
    for (let i = 0; i < 80; i++) deep = { a: deep }
    expect(findForbidden([{ stage: '$match', value: deep }])[0]).toMatchObject({ operator: 'too-deep' })
  })

  it('stops collecting after a bounded number of findings', () => {
    const value = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, { $out: 1 }]))
    expect(findForbidden([{ stage: '$match', value }]).length).toBeLessThanOrEqual(20)
  })
})

describe('parsePipeline', () => {
  it('reads the usual [{ "$stage": value }] form into request stages', () => {
    const result = parsePipeline('[{"$match":{"grp":"A"}},{"$group":{"_id":"$grp","n":{"$sum":1}}},{"$limit":5}]')
    expect(result).toEqual({
      ok: true,
      pipeline: [
        { stage: '$match', value: { grp: 'A' } },
        { stage: '$group', value: { _id: '$grp', n: { $sum: 1 } } },
        { stage: '$limit', value: 5 },
      ],
    })
  })

  it('also reads the request form { stage, value }', () => {
    expect(parsePipeline('[{"stage":"$limit","value":3}]')).toEqual({ ok: true, pipeline: [{ stage: '$limit', value: 3 }] })
  })

  it('accepts an empty pipeline and stages the visual editor has no form for', () => {
    expect(parsePipeline('[]')).toEqual({ ok: true, pipeline: [] })
    expect(parsePipeline('[{"$unwind":"$tags"},{"$sample":{"size":5}}]')).toMatchObject({ ok: true })
  })

  it('rejects invalid JSON, a non-array, an oversize text and too many stages', () => {
    expect(parsePipeline('[{')).toEqual({ ok: false, error: { code: 'invalid-json' } })
    expect(parsePipeline('{"$match":{}}')).toEqual({ ok: false, error: { code: 'not-array' } })
    expect(parsePipeline(`[${'1,'.repeat(150_000)}1]`)).toEqual({ ok: false, error: { code: 'too-large' } })
    expect(parsePipeline(JSON.stringify(Array.from({ length: 51 }, () => ({ $limit: 1 }))))).toEqual({ ok: false, error: { code: 'too-many-stages' } })
  })

  it('rejects a stage that is not exactly one $-named key, with its position', () => {
    for (const text of ['[5]', '[null]', '[[]]', '[{"match":{}}]', '[{"$match":{},"$limit":1}]', '[{}]', '[{"stage":"match","value":{}}]', '[{"stage":"$match"}]']) {
      expect(parsePipeline(text)).toEqual({ ok: false, error: { code: 'stage-shape', stageIndex: 0 } })
    }
    expect(parsePipeline('[{"$limit":1},7]')).toEqual({ ok: false, error: { code: 'stage-shape', stageIndex: 1 } })
  })

  it('refuses forbidden operators, naming the operator, stage and path', () => {
    expect(parsePipeline('[{"$limit":1},{"$addFields":{"x":{"$function":{"body":"function(){}","args":[],"lang":"js"}}}}]')).toEqual({
      ok: false,
      error: { code: 'forbidden-operator', stageIndex: 1, operator: '$function', path: '$addFields.x.$function' },
    })
    expect(parsePipeline('[{"$out":"somewhere"}]')).toMatchObject({ ok: false, error: { code: 'forbidden-operator', operator: '$out' } })
    expect(parsePipeline('[{"stage":"$unionWith","value":"other"}]')).toMatchObject({ ok: false, error: { code: 'forbidden-operator', operator: '$unionWith' } })
  })

  it('reports an over-nested pipeline as too-deep', () => {
    let deep: unknown = 1
    for (let i = 0; i < 80; i++) deep = { a: deep }
    expect(parsePipeline(JSON.stringify([{ $match: deep }]))).toMatchObject({ ok: false, error: { code: 'too-deep', stageIndex: 0 } })
  })
})

describe('round trip', () => {
  const stages = [stage('$match', { grp: 'A' }, 'a'), stage('$group', { _id: '$grp', n: { $sum: 1 } }, 'b'), stage('$sort', { n: -1 }, 'c'), stage('$limit', 5, 'd')]

  it('parsePipeline(pipelineToText(buildPipeline(stages))) returns the same pipeline', () => {
    const pipeline = buildPipeline(stages)
    expect(parsePipeline(pipelineToText(pipeline))).toEqual({ ok: true, pipeline })
  })

  it('toVisualStages gives back editable stages, or null when a stage has no visual form', () => {
    const pipeline = buildPipeline(stages)
    expect(toVisualStages(pipeline)?.map(s => [s.type, s.value])).toEqual(stages.map(s => [s.type, s.value]))
    expect(toVisualStages(pipeline, i => `id-${i}`)?.map(s => s.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3'])
    expect(toVisualStages([...pipeline, { stage: '$unwind', value: '$tags' }])).toBeNull()
  })
})
