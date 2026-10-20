// Pure helpers for the aggregation builder: turning stages into the request pipeline, parsing the
// pipeline text users type, and refusing what the server would happily run. No API calls and no
// DOM, so they behave the same in session and server-proxy mode and run in plain Node.
//
// The request pipeline is `{ stage: "$match", value: <JSON> }[]`; `value` is real JSON (a number
// for `$limit`), whatever the generated client type claims. The server does not allow-list stages —
// `$function` ran JavaScript and `$lookup`/`$unionWith` read other collections when tried — so the
// deny-list below is the only gate, applied to every stage name and operator key at any depth.

export const FORBIDDEN_OPERATORS = [
  '$out',
  '$merge',
  '$function',
  '$accumulator',
  '$where',
  '$lookup',
  '$unionWith',
  '$graphLookup',
] as const

export const VISUAL_STAGE_TYPES = ['$match', '$group', '$sort', '$project', '$limit'] as const

export type AggregationStageType = typeof VISUAL_STAGE_TYPES[number]

export interface AggregationStage {
  id: string
  type: AggregationStageType
  value: unknown
}

export interface RequestStage {
  stage: string
  value: unknown
}

export interface ForbiddenUse {
  stageIndex: number
  // a deny-listed operator, or 'too-deep' when the value nests deeper than the scan will follow
  operator: string
  // where it was found, e.g. `$addFields.x.$function`
  path: string
}

export type PipelineErrorCode = 'too-large' | 'invalid-json' | 'not-array' | 'too-many-stages' | 'stage-shape' | 'forbidden-operator' | 'too-deep'

export interface PipelineError {
  code: PipelineErrorCode
  stageIndex?: number
  operator?: string
  path?: string
}

export type ParsedPipeline = { ok: true, pipeline: RequestStage[] } | { ok: false, error: PipelineError }

export type StageIssueCode = 'not-object' | 'invalid-limit' | 'invalid-sort' | 'group-needs-id'

export interface StageIssue {
  // index in the stage list that was validated
  stageIndex: number
  code: StageIssueCode
}

const MAX_TEXT_LENGTH = 200_000
const MAX_STAGES = 50
const MAX_DEPTH = 64
const MAX_FINDINGS = 20
const FORBIDDEN = new Set<string>(FORBIDDEN_OPERATORS)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scan(value: unknown, path: string, depth: number, stageIndex: number, found: ForbiddenUse[]) {
  if (found.length >= MAX_FINDINGS) return
  if (depth > MAX_DEPTH) {
    found.push({ stageIndex, operator: 'too-deep', path })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => scan(item, `${path}[${i}]`, depth + 1, stageIndex, found))
    return
  }
  if (!isPlainObject(value)) return
  for (const [key, inner] of Object.entries(value)) {
    const keyPath = `${path}.${key}`
    if (FORBIDDEN.has(key)) found.push({ stageIndex, operator: key, path: keyPath })
    scan(inner, keyPath, depth + 1, stageIndex, found)
  }
}

// Deep scan: a stage whose name is deny-listed, or any operator key anywhere inside a stage's value
// (`$function` hides inside `$addFields`, `$lookup` inside a `$facet` sub-pipeline). Only keys count:
// a string value such as "$out" is just data.
export function findForbidden(pipeline: RequestStage[]): ForbiddenUse[] {
  const found: ForbiddenUse[] = []
  pipeline.forEach((stage, stageIndex) => {
    if (FORBIDDEN.has(stage.stage)) found.push({ stageIndex, operator: stage.stage, path: stage.stage })
    scan(stage.value, stage.stage, 0, stageIndex, found)
  })
  return found
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (isPlainObject(value) && Object.keys(value).length === 0)
}

// the server wants a number for $limit; a typed "10" is meant as 10
function normaliseValue(type: AggregationStageType, value: unknown): unknown {
  if (type === '$limit' && typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return value
}

// Stage list → request pipeline. A stage with nothing in it yet (no value, `{}`) is left out
// instead of sent, because the server rejects an empty `$project`/`$sort`.
export function buildPipeline(stages: AggregationStage[]): RequestStage[] {
  const pipeline: RequestStage[] = []
  for (const { type, value } of stages) {
    const normalised = normaliseValue(type, value)
    if (!isEmptyValue(normalised)) pipeline.push({ stage: type, value: normalised })
  }
  return pipeline
}

// Catches the usual mistakes before the server answers with a Java-flavoured 500.
export function validateStages(stages: AggregationStage[]): StageIssue[] {
  const issues: StageIssue[] = []
  stages.forEach(({ type, value: raw }, stageIndex) => {
    const value = normaliseValue(type, raw)
    if (isEmptyValue(value)) return
    if (type === '$limit') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) issues.push({ stageIndex, code: 'invalid-limit' })
      return
    }
    if (!isPlainObject(value)) {
      issues.push({ stageIndex, code: 'not-object' })
      return
    }
    if (type === '$group' && !('_id' in value)) issues.push({ stageIndex, code: 'group-needs-id' })
    if (type === '$sort' && !Object.values(value).every(direction => direction === 1 || direction === -1)) issues.push({ stageIndex, code: 'invalid-sort' })
  })
  return issues
}

// Parses the pipeline as users know it — `[{ "$match": { … } }, { "$limit": 5 }]` — or already in
// request form (`{ stage, value }`), enforcing the stage cap, the shape and the deny-list. The raw
// JSON tab must always go through here.
export function parsePipeline(text: string): ParsedPipeline {
  if (text.length > MAX_TEXT_LENGTH) return { ok: false, error: { code: 'too-large' } }
  let data: unknown
  try {
    data = JSON.parse(text)
  }
  catch {
    return { ok: false, error: { code: 'invalid-json' } }
  }
  if (!Array.isArray(data)) return { ok: false, error: { code: 'not-array' } }
  if (data.length > MAX_STAGES) return { ok: false, error: { code: 'too-many-stages' } }

  const pipeline: RequestStage[] = []
  for (const [stageIndex, item] of data.entries()) {
    const keys = isPlainObject(item) ? Object.keys(item) : []
    if (isPlainObject(item) && keys.length === 1 && keys[0]!.startsWith('$')) {
      pipeline.push({ stage: keys[0]!, value: item[keys[0]!] })
    }
    else if (isPlainObject(item) && keys.length === 2 && keys.includes('stage') && keys.includes('value') && typeof item.stage === 'string' && item.stage.startsWith('$')) {
      pipeline.push({ stage: item.stage, value: item.value })
    }
    else {
      return { ok: false, error: { code: 'stage-shape', stageIndex } }
    }
  }

  const forbidden = findForbidden(pipeline)[0]
  if (forbidden) {
    return {
      ok: false,
      error: { code: forbidden.operator === 'too-deep' ? 'too-deep' : 'forbidden-operator', stageIndex: forbidden.stageIndex, operator: forbidden.operator, path: forbidden.path },
    }
  }
  return { ok: true, pipeline }
}

// Request pipeline → the text form `parsePipeline` reads, for the raw JSON tab.
export function pipelineToText(pipeline: RequestStage[]): string {
  return JSON.stringify(pipeline.map(stage => ({ [stage.stage]: stage.value })), null, 2)
}

// Request pipeline → editable stages, or null when it uses a stage the visual editor has no form
// for (the user then stays in the raw JSON tab).
export function toVisualStages(pipeline: RequestStage[], makeId: (index: number) => string = index => `stage-${index}`): AggregationStage[] | null {
  const stages: AggregationStage[] = []
  for (const [index, { stage, value }] of pipeline.entries()) {
    if (!(VISUAL_STAGE_TYPES as readonly string[]).includes(stage)) return null
    stages.push({ id: makeId(index), type: stage as AggregationStageType, value })
  }
  return stages
}
