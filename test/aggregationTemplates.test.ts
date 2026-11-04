import { describe, expect, it } from 'vitest'
import { buildPipeline, findForbidden, validateStages } from '../src/runtime/utils/aggregationPipeline'
import { DEFAULT_TOP, isTemplateField, MAX_TOP, templateStages, TEMPLATES, validateTemplateInput } from '../src/runtime/utils/aggregationTemplates'

describe('templates', () => {
  it('count by field groups and sorts by the count', () => {
    expect(templateStages('count-by-field', { field: 'grp' })).toEqual([
      { type: '$group', value: { _id: '$grp', count: { $sum: 1 } } },
      { type: '$sort', value: { count: -1 } },
    ])
  })

  it('top values adds a limit, 10 by default', () => {
    expect(templateStages('top-values', { field: 'grp' }).at(-1)).toEqual({ type: '$limit', value: DEFAULT_TOP })
    expect(templateStages('top-values', { field: 'grp', top: 3 }).at(-1)).toEqual({ type: '$limit', value: 3 })
  })

  it('date histogram groups by month or day of a date field', () => {
    expect(templateStages('date-histogram', { field: 'when' })[0]).toEqual({ type: '$group', value: { _id: { $dateToString: { format: '%Y-%m', date: '$when' } }, count: { $sum: 1 } } })
    expect(templateStages('date-histogram', { field: 'when', unit: 'day' })[0]!.value).toMatchObject({ _id: { $dateToString: { format: '%Y-%m-%d' } } })
    expect(templateStages('date-histogram', { field: 'when' })[1]).toEqual({ type: '$sort', value: { _id: 1 } })
  })

  it('sum and average by group', () => {
    expect(templateStages('sum-avg-by-group', { field: 'grp', valueField: 'price' })).toEqual([
      { type: '$group', value: { _id: '$grp', total: { $sum: '$price' }, avg: { $avg: '$price' }, count: { $sum: 1 } } },
      { type: '$sort', value: { _id: 1 } },
    ])
  })

  it('supports nested field paths and trims names', () => {
    expect(templateStages('count-by-field', { field: ' address.city ' })[0]!.value).toMatchObject({ _id: '$address.city' })
  })

  it('every template builds stages that pass the builder\'s own validation and deny-list', () => {
    for (const info of TEMPLATES) {
      const stages = templateStages(info.key, { field: 'f', valueField: 'v', top: 5, unit: 'day' }).map((s, i) => ({ id: String(i), ...s }))
      expect(validateStages(stages)).toEqual([])
      expect(findForbidden(buildPipeline(stages))).toEqual([])
      expect(buildPipeline(stages)).toHaveLength(stages.length)
    }
  })
})

describe('validation', () => {
  it('refuses a field that cannot be written as $name', () => {
    for (const bad of ['', '  ', '$x', 'a$b', '.a', 'a.', 'a..b', 'a\u0000b']) expect(isTemplateField(bad)).toBe(false)
    for (const ok of ['a', 'a.b', 'my field', 'x_1']) expect(isTemplateField(ok)).toBe(true)
  })

  it('names the missing input', () => {
    expect(validateTemplateInput('count-by-field', { field: '' })).toBe('field')
    expect(validateTemplateInput('sum-avg-by-group', { field: 'g' })).toBe('value-field')
    expect(validateTemplateInput('sum-avg-by-group', { field: 'g', valueField: '$x' })).toBe('value-field')
    expect(validateTemplateInput('top-values', { field: 'g', top: 0 })).toBe('top')
    expect(validateTemplateInput('top-values', { field: 'g', top: MAX_TOP + 1 })).toBe('top')
    expect(validateTemplateInput('top-values', { field: 'g', top: 2.5 })).toBe('top')
    expect(validateTemplateInput('top-values', { field: 'g' })).toBeUndefined()
  })

  it('does not build a template from invalid input', () => {
    expect(() => templateStages('count-by-field', { field: '$bad' })).toThrow()
  })
})
