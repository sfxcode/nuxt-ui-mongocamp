// Ready-made pipelines for the usual questions. Every template gives plain stages (`type` + JSON `value`) that fill the
// stage editor and stay editable. Pure. The shapes were run on server 1.6.3 (live, 2026-11-04).
import type { AggregationStageType } from './aggregationPipeline'

export type TemplateKey = 'count-by-field' | 'top-values' | 'date-histogram' | 'sum-avg-by-group'

export interface TemplateStage {
  type: AggregationStageType
  value: unknown
}

export type DateUnit = 'year' | 'month' | 'day'

export interface TemplateInput {
  field: string
  /** `sum-avg-by-group`: the numeric field to add up and average. */
  valueField?: string
  /** `top-values`: how many values to keep (default 10). */
  top?: number
  /** `date-histogram`: the bucket size (default month). */
  unit?: DateUnit
}

export interface TemplateInfo {
  key: TemplateKey
  /** Which inputs it needs besides `field`. */
  needsValueField: boolean
  needsTop: boolean
  needsUnit: boolean
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { key: 'count-by-field', needsValueField: false, needsTop: false, needsUnit: false },
  { key: 'top-values', needsValueField: false, needsTop: true, needsUnit: false },
  { key: 'date-histogram', needsValueField: false, needsTop: false, needsUnit: true },
  { key: 'sum-avg-by-group', needsValueField: true, needsTop: false, needsUnit: false },
]

export const DEFAULT_TOP = 10
export const MAX_TOP = 1000
export const DATE_FORMATS: Record<DateUnit, string> = { year: '%Y', month: '%Y-%m', day: '%Y-%m-%d' }

/** A field name that can be written as `$name` in a pipeline: not empty, no `$`, no NUL, no leading/trailing/double dot. */
export function isTemplateField(field: string): boolean {
  return field.trim() !== '' && !field.includes('$') && !field.includes('\u0000') && !/^\.|\.$|\.\./.test(field.trim())
}

export type TemplateProblem = 'field' | 'value-field' | 'top'

/** What is wrong with the input of a template, or `undefined`. */
export function validateTemplateInput(key: TemplateKey, input: TemplateInput): TemplateProblem | undefined {
  if (!isTemplateField(input.field)) return 'field'
  const info = TEMPLATES.find(t => t.key === key)!
  if (info.needsValueField && !isTemplateField(input.valueField ?? '')) return 'value-field'
  if (info.needsTop && input.top !== undefined && (!Number.isInteger(input.top) || input.top < 1 || input.top > MAX_TOP)) return 'top'
  return undefined
}

/** The stages of a template. Throws for invalid input — check `validateTemplateInput` first. */
export function templateStages(key: TemplateKey, input: TemplateInput): TemplateStage[] {
  const problem = validateTemplateInput(key, input)
  if (problem) throw new Error(`Invalid template input: ${problem}`)
  const field = `$${input.field.trim()}`
  switch (key) {
    case 'count-by-field':
      return [
        { type: '$group', value: { _id: field, count: { $sum: 1 } } },
        { type: '$sort', value: { count: -1 } },
      ]
    case 'top-values':
      return [
        { type: '$group', value: { _id: field, count: { $sum: 1 } } },
        { type: '$sort', value: { count: -1 } },
        { type: '$limit', value: input.top ?? DEFAULT_TOP },
      ]
    case 'date-histogram':
      return [
        { type: '$group', value: { _id: { $dateToString: { format: DATE_FORMATS[input.unit ?? 'month'], date: field } }, count: { $sum: 1 } } },
        { type: '$sort', value: { _id: 1 } },
      ]
    case 'sum-avg-by-group':
      return [
        { type: '$group', value: { _id: field, total: { $sum: `$${input.valueField!.trim()}` }, avg: { $avg: `$${input.valueField!.trim()}` }, count: { $sum: 1 } } },
        { type: '$sort', value: { _id: 1 } },
      ]
  }
}
